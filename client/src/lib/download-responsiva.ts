function sanitizeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "x";
}

export async function downloadResponsiva(input: {
  itemId: number;
  itemCode: string;
  responsible: string | null | undefined;
}): Promise<void> {
  const res = await fetch(`/api/inventory/${input.itemId}/responsiva`, {
    credentials: "include",
  });
  if (!res.ok) {
    let message = "Error al generar el documento";
    try {
      const json = (await res.json()) as { error?: string; message?: string };
      message = json.error ?? json.message ?? message;
    } catch {
      // response had no JSON body; keep default
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Responsiva_${sanitizeSegment(input.itemCode)}_${sanitizeSegment(
    input.responsible ?? "responsable",
  )}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
