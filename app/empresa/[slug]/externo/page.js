import ExternalDashboardCatalogPage from '@/components/company/ExternalDashboardCatalogPage'

export default async function CompanyExternalDashboardRoute({ params }) {
  const { slug } = await params
  return <ExternalDashboardCatalogPage slug={slug} />
}
