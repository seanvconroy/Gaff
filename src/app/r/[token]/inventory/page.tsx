import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { formatDate } from '@/lib/format';
import { InventoryPage } from '../Inventory';
import { LinkEnded, loadRenter } from '../load';

export const metadata: Metadata = { title: 'Your move-in inventory' };
export const dynamic = 'force-dynamic';

/** R25, UX-RN-25: the tenant's inventory, once the lister has shared it with them. */
export default async function InventoryRoute({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await loadRenter(token);
  if (!loaded) return <LinkEnded />;
  const { page, model } = loaded;
  if (model.view !== 'tenancy' || !page.tenancy?.inventorySharedAt || page.inventory.length === 0) {
    redirect(`/r/${token}`);
  }
  return (
    <InventoryPage
      token={token}
      model={model}
      items={page.inventory}
      confirmedOn={
        page.tenancy.inventoryConfirmedAt ? formatDate(page.tenancy.inventoryConfirmedAt) : null
      }
    />
  );
}
