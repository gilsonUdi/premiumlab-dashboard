import CompanyDashboardPage from '@/components/company/CompanyDashboardPage'

export default async function CompanyExternalDashboardEmbedRoute({ params }) {
  const { slug, dashboardKey } = await params
  return <CompanyDashboardPage slug={slug} mode="external" externalDashboardKey={dashboardKey} />
}
