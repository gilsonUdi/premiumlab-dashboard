import PowerBiCatalogPage from '@/components/company/PowerBiCatalogPage'

export default async function CompanyPowerBiRoute({ params }) {
  const { slug } = await params
  return <PowerBiCatalogPage slug={slug} />
}
