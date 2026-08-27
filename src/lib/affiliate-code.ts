import { prisma } from '@/lib/prisma';

/**
 * Código de referida legible.
 *
 * El upstream generaba `AF${Date.now()}${random}` → AF17878643077402B2A.
 * Imposible de dictar por teléfono, de decir en una historia o de
 * escribir sin equivocarse — y una afiliada vive de que su código se
 * pueda compartir de boca en boca.
 *
 * Se busca el más corto que esté libre, en este orden:
 *   1. MARIA           (el nombre solo — lo ideal)
 *   2. MARIAG          (+ inicial del apellido)
 *   3. MARIAGOMEZ      (+ apellido completo)
 *   4. MARIA2, MARIA3… (último recurso)
 *
 * Solo letras A-Z sin tildes: nada de números ni símbolos que se
 * confundan al dictarlos.
 */

function soloLetras(txt: string): string {
  return (txt || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // quita tildes
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();
}

async function libre(code: string): Promise<boolean> {
  const existe = await prisma.affiliate.findUnique({ where: { referralCode: code } });
  return !existe;
}

export async function generarCodigoAfiliada(nombreCompleto: string): Promise<string> {
  const partes = (nombreCompleto || '').trim().split(/\s+/).filter(Boolean);
  const nombre = soloLetras(partes[0] || '').slice(0, 12);
  const apellido = soloLetras(partes[1] || '');

  const candidatos: string[] = [];
  if (nombre) candidatos.push(nombre);
  if (nombre && apellido) {
    candidatos.push(nombre + apellido[0]);
    candidatos.push(nombre + apellido.slice(0, 10));
  }

  for (const c of candidatos) {
    if (c.length >= 3 && (await libre(c))) return c;
  }

  // Sin nombre utilizable o todo ocupado: se numera.
  const base = nombre && nombre.length >= 3 ? nombre : 'AMALIA';
  for (let i = 2; i < 100; i++) {
    const c = `${base}${i}`;
    if (await libre(c)) return c;
  }
  // Salida de emergencia — no debería llegar acá nunca.
  return `${base}${Date.now().toString().slice(-5)}`;
}

/** Normaliza un código escrito a mano por el admin (p. ej. el @ de una
 *  influencer). Devuelve null si no sirve o si ya está tomado. */
export async function normalizarCodigoManual(raw: string): Promise<string | null> {
  const code = soloLetras(raw).slice(0, 20);
  if (code.length < 3) return null;
  return (await libre(code)) ? code : null;
}
