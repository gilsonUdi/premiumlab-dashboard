import CompanyHomePage from '@/components/company/CompanyHomePage'

export default function CompanyPage({ params }) {
  return <CompanyHomePage slug={params.slug} />
}
