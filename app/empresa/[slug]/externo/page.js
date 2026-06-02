import ExternalDashboardCatalogPage from '@/components/company/ExternalDashboardCatalogPage'

export default function CompanyExternalDashboardRoute({ params }) {
  return <ExternalDashboardCatalogPage slug={params.slug} />
}
