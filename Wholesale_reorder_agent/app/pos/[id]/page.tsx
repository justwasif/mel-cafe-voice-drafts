import PoDetailContent from './po-detail-content';

export const instant = false;

// Server-component wrapper that reads the dynamic params, so the client
// component receives a plain `id` prop and no prerender-blocking `use(params)`.
export default async function PoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PoDetailContent id={id} />;
}
