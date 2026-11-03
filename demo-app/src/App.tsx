import type { ComponentType } from 'react'
import { matchPath, useLocation, useScrollOnNavigate } from './router'
import { DemoBanner } from './layout/DemoBanner'
import { Header } from './layout/Header'
import { Footer } from './layout/Footer'
import { MobileTabBar } from './layout/MobileTabBar'
import { HomePage } from './pages/Home'
import { ConfigurePage } from './pages/Configure'
import { NotFoundPage } from './pages/NotFound'
import { SignInPage } from './pages/SignIn'
import { RegisterPage } from './pages/Register'
import { WelcomePage } from './pages/Welcome'
import { BusinessProfilePage, ComparePage, MyQuotesPage, QuotePage, QuoteViewPage } from './pages/quotes'
import { JobPage, JobsPage } from './pages/jobs'
import {
  ComplianceDocumentPage,
  CompliancePackPage,
  CompliancePage,
  FindPage,
  FindUnknownDemoPage,
  ListingPage,
  ManualPage,
  ManualSubmitPage,
  ManualsPage,
  MarketplacePage,
  ModelPage,
  MyRequestPage,
  MyRequestsPage,
  RequestTechnicianPage,
  RequestThanksPage,
  SearchPage,
  SpringCalculatorPage,
  ToolsPage,
} from './pages/services'
import {
  DashboardPage,
  LeadsPage,
  ListingFormPage,
  MyListingsPage,
  PricingBusinessPage,
  PricingEditPage,
  PricingPage,
  PricingPaymentsPage,
  PricingProfilePage,
  PricingQuotesPage,
} from './pages/business'
import {
  AdminBusinessesPage,
  AdminCategoriesPage,
  AdminManualsPage,
  AdminManualSubmissionsPage,
  AdminManufacturersPage,
  AdminMarketplacePage,
  AdminMetricsPage,
  AdminModelsPage,
  AdminOverviewPage,
  AdminPricingPage,
  AdminReviewsPage,
  AdminSettingsPage,
  AdminUsersPage,
} from './pages/admin'
import { AccountPage, DemoGuidePage, MessagePage, MessagesPage, NotificationsPage, SavedPage, SupportPage } from './pages/account'

type Page = ComponentType<{ params: Record<string, string> }>

// Paths match the real app's routes, so links inside its components work.
// First match wins: fixed segments go before the `:param` route beside them.
const ROUTES: Array<[string, Page]> = [
  ['/', HomePage],
  ['/configure', ConfigurePage],
  ['/sign-in', SignInPage],
  ['/register', RegisterPage],
  ['/welcome', WelcomePage],

  // Design → quotes → booking → job
  ['/quote', QuotePage],
  ['/compare/:reference', ComparePage],
  ['/quotes', MyQuotesPage],
  ['/quotes/:reference', QuoteViewPage],
  ['/jobs', JobsPage],
  ['/jobs/:id', JobPage],
  ['/businesses/:id', BusinessProfilePage],

  // Hire a pro, marketplace, manuals, tools, compliance
  ['/request-technician', RequestTechnicianPage],
  ['/request-technician/thanks', RequestThanksPage],
  ['/my-requests', MyRequestsPage],
  ['/my-requests/:reference', MyRequestPage],
  ['/marketplace', MarketplacePage],
  ['/marketplace/:id', ListingPage],
  ['/manuals', ManualsPage],
  ['/manuals/submit', ManualSubmitPage],
  ['/manuals/finder', FindPage],
  ['/manuals/:slug', ManualPage],
  ['/tools', ToolsPage],
  ['/tools/spring-calculator', SpringCalculatorPage],
  ['/find', FindPage],
  ['/find/unknown', FindUnknownDemoPage],
  ['/model/:id', ModelPage],
  ['/compliance', CompliancePage],
  ['/compliance-pack', CompliancePage],
  ['/compliance/pack', CompliancePackPage],
  ['/compliance/pack/all', CompliancePackPage],
  ['/compliance/pack/:code', ComplianceDocumentPage],
  ['/search', SearchPage],

  // Business: job board, automated pricing, dashboards, listings
  ['/leads', LeadsPage],
  ['/pricing', PricingPage],
  ['/pricing/quotes', PricingQuotesPage],
  ['/pricing/profile', PricingProfilePage],
  ['/pricing/payments', PricingPaymentsPage],
  ['/pricing/business', PricingBusinessPage],
  ['/pricing/:id', PricingEditPage],
  ['/dashboard', DashboardPage],
  ['/my-listings', MyListingsPage],
  ['/my-listings/new', ListingFormPage],
  ['/my-listings/:id/edit', ListingFormPage],

  // Admin (catalogue screens are open to manufacturers too)
  ['/admin', AdminOverviewPage],
  ['/admin/manufacturers', AdminManufacturersPage],
  ['/admin/categories', AdminCategoriesPage],
  ['/admin/models', AdminModelsPage],
  ['/admin/manuals', AdminManualsPage],
  ['/admin/manual-submissions', AdminManualSubmissionsPage],
  ['/admin/marketplace', AdminMarketplacePage],
  ['/admin/businesses', AdminBusinessesPage],
  ['/admin/pricing', AdminPricingPage],
  ['/admin/reviews', AdminReviewsPage],
  ['/admin/users', AdminUsersPage],
  ['/admin/metrics', AdminMetricsPage],
  ['/admin/settings', AdminSettingsPage],

  // Account
  ['/account', AccountPage],
  ['/messages', MessagesPage],
  ['/messages/:id', MessagePage],
  ['/notifications', NotificationsPage],
  ['/saved', SavedPage],
  ['/support', SupportPage],
  ['/support/new', SupportPage],
  ['/demo', DemoGuidePage],
]

export function App() {
  const location = useLocation()
  useScrollOnNavigate()
  let Page: Page = NotFoundPage
  let params: Record<string, string> = {}
  for (const [pattern, component] of ROUTES) {
    const match = matchPath(pattern, location.pathname)
    if (match) {
      Page = component
      params = match
      break
    }
  }

  return (
    <div className="demo-pad-top flex min-h-screen flex-col">
      <DemoBanner />
      <Header />
      <main id="main" className="flex-1">
        <Page key={location.pathname} params={params} />
      </main>
      <Footer />
      <MobileTabBar />
    </div>
  )
}
