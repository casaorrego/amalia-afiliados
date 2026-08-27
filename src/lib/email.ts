/**
 * Correos del programa de afiliadas — TODOS por Loops (founder 27-ago).
 *
 * El upstream traía ~900 líneas: un cliente de Resend y catorce plantillas
 * de HTML crudo, de las cuales solo TRES se usaban de verdad. Las demás
 * no las llamaba nadie.
 *
 * Ahora el diseño de cada correo vive en el editor visual de Loops (cero
 * HTML acá) y este archivo solo dispara el transactional con sus
 * variables. Mismo proveedor que el resto de Amalia: un dominio
 * verificado, una factura, un lugar donde editar los textos.
 *
 * Plantillas que hay que tener creadas en Loops (el nombre debe coincidir
 * EXACTO, se resuelven por nombre — ver lib/loops.ts):
 *
 *   afiliados_codigo_acceso   {codigo} {nombre}          — login
 *   afiliados_bienvenida      {nombre} {codigo} {link} {entrar}
 *   afiliados_comision_nueva  {nombre} {monto} {referida}
 *   afiliados_pago_en_camino  {nombre} {monto} {metodo}
 *   afiliados_pago_enviado    {nombre} {monto} {metodo}
 *   afiliados_aviso           {nombre} {titulo} {mensaje}
 *
 * Si una plantilla no existe en Loops, el envío falla y queda en los
 * logs — nunca tumba la operación que lo disparó.
 */

import { sendTransactionalByName } from '@/lib/loops';
import { formatCOP } from '@/lib/money';

type Result = { success: boolean; message: string };

function primerNombre(nombre?: string | null): string {
  return (nombre || '').trim().split(/\s+/)[0] || '';
}

async function enviar(
  plantilla: string,
  email: string,
  vars: Record<string, string>
): Promise<Result> {
  const r = await sendTransactionalByName(plantilla, email, vars);
  if (!r.ok) {
    console.error(`[loops] "${plantilla}" no salió para ${email}: ${r.error}`);
    return { success: false, message: r.error || 'no se pudo enviar' };
  }
  return { success: true, message: 'enviado' };
}

class EmailService {
  /** Le entró una comisión nueva por una referida que convirtió. */
  async sendTransactionCreatedEmail(
    to: string,
    data: {
      affiliateName: string;
      customerName?: string | null;
      amountCents: number;
      commissionCents: number;
      commissionRate?: number;
      transactionId?: string;
    }
  ): Promise<Result> {
    return enviar('afiliados_comision_nueva', to, {
      nombre: primerNombre(data.affiliateName),
      monto: formatCOP(data.commissionCents),
      referida: data.customerName || 'una referida tuya',
    });
  }

  /** Se le programó un pago (todavía no sale la plata). */
  async sendPayoutCreatedEmail(
    to: string,
    data: {
      affiliateName: string;
      amountCents: number;
      commissionCount?: number;
      payoutId?: string;
      method?: string;
    }
  ): Promise<Result> {
    return enviar('afiliados_pago_en_camino', to, {
      nombre: primerNombre(data.affiliateName),
      monto: formatCOP(data.amountCents),
      metodo: data.method || 'Nequi',
    });
  }

  /** Ya se le transfirió. */
  async sendPayoutCompletedEmail(
    to: string,
    data: {
      affiliateName: string;
      amountCents: number;
      commissionCount?: number;
      payoutId?: string;
      method?: string;
      processedAt?: string;
    }
  ): Promise<Result> {
    return enviar('afiliados_pago_enviado', to, {
      nombre: primerNombre(data.affiliateName),
      monto: formatCOP(data.amountCents),
      metodo: data.method || 'Nequi',
    });
  }

  /** Aviso suelto — hoy solo lo usa el webhook de reembolsos, cuando se
   *  revierte una comisión. Loops no manda HTML arbitrario, así que va
   *  por una plantilla genérica con título y mensaje como variables. */
  async sendGenericEmail(
    to: string,
    data: { subject: string; body: string }
  ): Promise<Result> {
    return enviar('afiliados_aviso', to, {
      nombre: '',
      titulo: data.subject,
      mensaje: data.body,
    });
  }
}

export const emailService = new EmailService();
