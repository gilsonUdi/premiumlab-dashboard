import PowerBiCatalogPage from '@/components/company/PowerBiCatalogPage'

export default function CompanyPowerBiRoute({ params }) {
  return <PowerBiCatalogPage slug={params.slug} />
}
