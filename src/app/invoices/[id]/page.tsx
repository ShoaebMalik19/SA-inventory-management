import { InvoiceView } from "./invoice-view";

export default async function InvoicePage({ params }: PageProps<"/invoices/[id]">) {
  const { id } = await params;
  return <InvoiceView id={id} />;
}
