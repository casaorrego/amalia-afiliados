'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Users,
  Plus,
  Loader2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Ban,
  Search,
  Filter,
  Download,
} from 'lucide-react';

interface Referral {
  id: string;
  leadName: string;
  leadEmail: string;
  company?: string;
  estimatedValue: number;
  status: string;
  createdAt: string;
}

export default function ReferralsPage() {
  const { user, loading: authLoading } = useAuth();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [submitForm, setSubmitForm] = useState({
    leadName: '',
    leadEmail: '',
    estimatedValue: '0',
  });

  useEffect(() => {
    if (!authLoading && user) fetchReferrals();
  }, [authLoading, user]);

  const fetchReferrals = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/affiliate/referrals');
      const data = await res.json();
      if (data.success) setReferrals(data.referrals || []);
    } catch (error) {
      console.error('Failed to fetch referrals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    try {
      const res = await fetch('/api/affiliate/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_name: submitForm.leadName,
          lead_email: submitForm.leadEmail,
          estimated_value: submitForm.estimatedValue,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showNotification('success', 'Lead submitted successfully!');
        setShowSubmitModal(false);
        setSubmitForm({ leadName: '', leadEmail: '', estimatedValue: '0' });
        fetchReferrals();
      } else {
        showNotification('error', data.error || 'No pudimos registrar la referida');
      }
    } catch (_e) {
      showNotification('error', 'No pudimos registrar la referida');
    } finally {
      setSubmitLoading(false);
    }
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });

  const getStatusBadge = (status: string) => {
    const map: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
      APPROVED: { variant: 'default', icon: CheckCircle2 },
      PENDING: { variant: 'secondary', icon: Clock },
      REJECTED: { variant: 'destructive', icon: Ban },
    };
    const { variant, icon: Icon } = map[status] || { variant: 'outline' as const, icon: Clock };
    return (
      <Badge variant={variant} className="gap-1 text-xs">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  const filteredReferrals = referrals.filter((r) => {
    const matchesSearch =
      !searchQuery ||
      r.leadName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.leadEmail.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: referrals.length,
    pending: referrals.filter((r) => r.status === 'PENDING').length,
    approved: referrals.filter((r) => r.status === 'APPROVED').length,
    rejected: referrals.filter((r) => r.status === 'REJECTED').length,
  };

  const exportCSV = () => {
    const headers = ['Nombre', 'Correo', 'Empresa', 'Estado', 'Valor', 'Fecha'];
    const rows = filteredReferrals.map((r) => [
      r.leadName,
      r.leadEmail,
      r.company || '',
      r.status,
      (Number(r.estimatedValue) || 0).toFixed(2),
      formatDate(r.createdAt),
    ]);
    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `referrals-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  if (authLoading || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {notification && (
        <Alert variant={notification.type === 'error' ? 'destructive' : 'default'}>
          {notification.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertDescription>{notification.message}</AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Referidas</h1>
          <p className="text-muted-foreground">Consulta y administra tus referidas</p>
        </div>
        <Button onClick={() => setShowSubmitModal(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Registrar referida
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pendiente</p>
            <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Aprobado</p>
            <p className="text-2xl font-bold text-emerald-600">{stats.approved}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Rechazado</p>
            <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o correo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los estados</SelectItem>
            <SelectItem value="PENDING">Pendiente</SelectItem>
            <SelectItem value="APPROVED">Aprobado</SelectItem>
            <SelectItem value="REJECTED">Rechazado</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportCSV} className="gap-1.5">
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filteredReferrals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="h-12 w-12 text-muted-foreground/40 mb-3" />
              <p className="font-medium">No hay referidas</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {referrals.length === 0 ? 'Registra tu primera referida para empezar a ganar' : 'Prueba cambiando los filtros'}
              </p>
              {referrals.length === 0 && (
                <Button className="mt-4" onClick={() => setShowSubmitModal(true)}>Registra tu primera referida</Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre de la referida</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Valor est.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReferrals.map((ref) => (
                  <TableRow key={ref.id}>
                    <TableCell className="font-medium">{ref.leadName}</TableCell>
                    <TableCell className="text-muted-foreground">{ref.leadEmail}</TableCell>
                    <TableCell className="text-muted-foreground">{ref.company || '\u2014'}</TableCell>
                    <TableCell>{getStatusBadge(ref.status)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(ref.createdAt)}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {`\u20B9${(Number(ref.estimatedValue) || 0).toFixed(2)}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Submit Lead Modal */}
      <Dialog open={showSubmitModal} onOpenChange={setShowSubmitModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar referida</DialogTitle>
            <DialogDescription>
              Llena los datos para registrar una referida.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitLead} className="space-y-4">
            <div className="space-y-2">
              <Label>Lead&apos;s Name *</Label>
              <Input
                required
                value={submitForm.leadName}
                onChange={(e) => setSubmitForm({ ...submitForm, leadName: e.target.value })}
                placeholder="Nombre completo"
              />
            </div>
            <div className="space-y-2">
              <Label>Contact Email *</Label>
              <Input
                type="email"
                required
                value={submitForm.leadEmail}
                onChange={(e) => setSubmitForm({ ...submitForm, leadEmail: e.target.value })}
                placeholder="nombre@correo.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Valor estimado (COP) *</Label>
              <Input
                type="number"
                required
                value={submitForm.estimatedValue}
                onChange={(e) => setSubmitForm({ ...submitForm, estimatedValue: e.target.value })}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">Escribe 0 si no sabes</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowSubmitModal(false)}>Cancelar</Button>
              <Button type="submit" disabled={submitLoading}>
                {submitLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Lead
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
