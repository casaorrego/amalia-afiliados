import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emailService } from '@/lib/email';
import { APP_URL } from '@/lib/config';
import { formatCOP } from '@/lib/money';

async function verifyAdmin(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) return null;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'ADMIN') return null;
    return user;
  } catch (_e) {
    return null;
  }
}

/**
 * POST - Send a report via email to specified recipients.
 * Body: { reportType, recipients, startDate?, endDate?, format? }
 */
export async function POST(request: NextRequest) {
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { reportType, recipients, startDate, endDate, format } = body;

    if (!reportType || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json(
        { error: 'reportType and recipients array are required' },
        { status: 400 }
      );
    }

    // Generate report data
    const reportData = await generateReportData(reportType, startDate, endDate);

    // Format as CSV
    const csvContent = convertToCSV(reportData.data || [reportData.summary || reportData]);

    // Build email HTML
    const reportDate = new Date().toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    // Resumen en TEXTO: Loops no manda HTML arbitrario, el diseño vive
    // en su plantilla. El detalle completo va en el CSV adjunto y en el
    // link al reporte.
    const lineas: string[] = [];
    if (startDate && endDate) lineas.push(`Periodo: ${startDate} — ${endDate}`);
    if (reportData.summary) {
      for (const [k, v] of Object.entries(reportData.summary)) {
        lineas.push(`${k}: ${String(v)}`);
      }
    }
    if (reportData.data?.length) {
      lineas.push(`Registros: ${reportData.data.length}`);
    }
    lineas.push(`Ver el reporte completo: ${APP_URL}/admin/reports`);
    lineas.push(`Enviado por ${user.name} (${user.email})`);
    const resumenTexto = lineas.join('\n');

    // Send to all recipients
    const results = await Promise.allSettled(
      recipients.map((email: string) =>
        emailService.sendGenericEmail(email.trim(), {
          subject: `Reporte ${reportData.type || ''} — ${reportDate}`,
          body: resumenTexto,
        })
      )
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    return NextResponse.json({
      success: true,
      message: `Report sent to ${sent} recipient(s)${failed > 0 ? `, ${failed} failed` : ''}`,
      sent,
      failed,
    });
  } catch (error) {
    console.error('Email report delivery error:', error);
    return NextResponse.json({ error: 'Failed to send report email' }, { status: 500 });
  }
}

async function generateReportData(reportType: string, startDate?: string, endDate?: string) {
  const dateFilter = startDate && endDate
    ? { createdAt: { gte: new Date(startDate), lte: new Date(endDate) } }
    : {};

  if (reportType === 'affiliates') {
    const affiliates = await prisma.affiliate.findMany({
      include: {
        user: true,
        referrals: { where: dateFilter },
        commissions: { where: dateFilter },
      },
    });
    return {
      type: 'Affiliate Performance Report',
      data: affiliates.map((a) => ({
        name: a.user.name,
        email: a.user.email,
        referralCode: a.referralCode,
        totalReferrals: a.referrals.length,
        approved: a.referrals.filter((r) => r.status === 'APPROVED').length,
        totalEarningsCents: a.commissions.reduce((s, c) => s + c.amountCents, 0),
        joinedDate: a.createdAt.toISOString().slice(0, 10),
      })),
    };
  }

  if (reportType === 'referrals') {
    const referrals = await prisma.referral.findMany({
      where: dateFilter,
      include: { affiliate: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      type: 'Referrals Report',
      data: referrals.map((r) => ({
        leadName: r.leadName,
        leadEmail: r.leadEmail,
        status: r.status,
        affiliate: r.affiliate.user.name,
        submittedDate: r.createdAt.toISOString().slice(0, 10),
      })),
    };
  }

  if (reportType === 'commissions') {
    const commissions = await prisma.commission.findMany({
      where: dateFilter,
      include: { affiliate: { include: { user: true } }, conversion: true },
      orderBy: { createdAt: 'desc' },
    });
    return {
      type: 'Commissions Report',
      data: commissions.map((c) => ({
        affiliate: c.affiliate.user.name,
        amountCents: c.amountCents,
        rate: c.rate,
        status: c.status,
        createdDate: c.createdAt.toISOString().slice(0, 10),
      })),
    };
  }

  if (reportType === 'payouts') {
    const payouts = await prisma.payout.findMany({
      where: dateFilter,
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
    return {
      type: 'Payouts Report',
      data: payouts.map((p) => ({
        affiliate: p.user.name,
        amountCents: p.amountCents,
        method: p.method,
        status: p.status,
        requestedDate: p.createdAt.toISOString().slice(0, 10),
      })),
    };
  }

  // Default: summary
  const totalAffiliates = await prisma.affiliate.count();
  const totalReferrals = await prisma.referral.count({ where: dateFilter });
  const approvedReferrals = await prisma.referral.count({ where: { ...dateFilter, status: 'APPROVED' } });
  const totalCommissions = await prisma.commission.aggregate({
    where: dateFilter,
    _sum: { amountCents: true },
    _count: true,
  });
  const totalPayouts = await prisma.payout.aggregate({
    where: dateFilter,
    _sum: { amountCents: true },
    _count: true,
  });

  return {
    type: 'Summary Report',
    summary: {
      totalAffiliates,
      totalReferrals,
      approvedReferrals,
      conversionRate: totalReferrals > 0 ? ((approvedReferrals / totalReferrals) * 100).toFixed(2) + '%' : '0%',
      totalCommissions: totalCommissions._count,
      totalCommissionAmountCents: totalCommissions._sum.amountCents || 0,
      totalPayouts: totalPayouts._count,
      totalPayoutAmountCents: totalPayouts._sum.amountCents || 0,
    },
  };
}

function renderSummaryHTML(summary: Record<string, unknown>): string {
  return `<div style="margin: 15px 0;">
    ${Object.entries(summary)
      .map(
        ([key, value]) => `
      <div class="stat">
        <div class="stat-value">${
          typeof value === 'number' && key.toLowerCase().includes('cents')
            ? formatCOP(value)
            : value
        }</div>
        <div class="stat-label">${key.replace(/([A-Z])/g, ' $1').replace(/cents$/i, '').trim()}</div>
      </div>`
      )
      .join('')}
  </div>`;
}

function renderTableHTML(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';
  const cols = Object.keys(data[0]);
  return `
    <table>
      <thead><tr>${cols.map((c) => `<th>${c.replace(/([A-Z])/g, ' $1').trim()}</th>`).join('')}</tr></thead>
      <tbody>${data
        .map(
          (row) => `<tr>${cols
            .map((c) => {
              const v = row[c];
              if (typeof v === 'number' && c.toLowerCase().includes('cents')) {
                return `<td>${formatCOP(v)}</td>`;
              }
              return `<td>${v ?? '—'}</td>`;
            })
            .join('')}</tr>`
        )
        .join('')}</tbody>
    </table>`;
}

function convertToCSV(data: Record<string, unknown>[]): string {
  if (!data || data.length === 0) return '';
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map((row) =>
    Object.values(row)
      .map((val) => (typeof val === 'string' && val.includes(',') ? `"${val}"` : val))
      .join(',')
  );
  return [headers, ...rows].join('\n');
}
