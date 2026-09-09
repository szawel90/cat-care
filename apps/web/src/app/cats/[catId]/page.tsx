import { CatApp } from '@/components/cat-app';
export default async function CatPage({ params }: { params: Promise<{ catId: string }> }) {
  const { catId } = await params;
  return <CatApp key={catId} catId={catId} />;
}
