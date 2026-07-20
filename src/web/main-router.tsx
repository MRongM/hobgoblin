import {
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { App } from '#/web/App.tsx'
import { getInitialBootstrap } from '#/web/bootstrap.ts'
import { isSettingsPage, type SettingsPage } from '#/shared/settings-pages.ts'

const rootRoute = createRootRoute({ component: MainWindowRoute })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/workspace' })
  },
})

const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspace',
})

const settingsIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  beforeLoad: () => {
    throw redirect({ to: '/settings/general' })
  },
})

const settingsGeneralRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/general',
})

const settingsFilesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/files',
})

const settingsTerminalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/terminal',
})

const settingsShortcutsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/shortcuts',
})

const settingsNotificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/notifications',
})

const settingsSshRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/ssh',
})

const settingsSyncRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/sync',
})

const settingsProxyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/proxy',
})

const settingsAppsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/apps',
})

const settingsSecurityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/security',
})

const settingsLanRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/lan',
  beforeLoad: () => {
    if (getInitialBootstrap().runtime.kind !== 'electron') {
      throw redirect({ to: '/settings/general' })
    }
  },
})

const settingsAboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/about',
})

const mainRouteTree = rootRoute.addChildren([
  indexRoute,
  workspaceRoute,
  settingsIndexRoute,
  settingsGeneralRoute,
  settingsFilesRoute,
  settingsTerminalRoute,
  settingsShortcutsRoute,
  settingsNotificationsRoute,
  settingsSshRoute,
  settingsSyncRoute,
  settingsProxyRoute,
  settingsAppsRoute,
  settingsSecurityRoute,
  settingsLanRoute,
  settingsAboutRoute,
])

export const mainRouter = createRouter({
  routeTree: mainRouteTree,
  history: createBrowserHistory(),
  InnerWrap: ({ children }) => (
    <>
      {children}
      {import.meta.env.DEV ? <TanStackRouterDevtools /> : null}
    </>
  ),
})

function MainWindowRoute() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const navigate = useNavigate()
  const routeSettingsPage = settingsPageFromPathname(pathname)
  return (
    <App
      routeSettingsPage={routeSettingsPage}
      onRouteSettingsPageChange={(nextPage) => {
        void navigate({ to: nextPage ? settingsRoutePath(nextPage) : '/workspace', replace: false })
      }}
    />
  )
}

function settingsRoutePath(page: SettingsPage) {
  return `/settings/${page}` as const
}

function settingsPageFromPathname(pathname: string): SettingsPage | null {
  const prefix = '/settings/'
  if (!pathname.startsWith(prefix)) return null
  const page = pathname.slice(prefix.length)
  return isSettingsPage(page) ? page : null
}

export function MainWindowRouterProvider() {
  return <RouterProvider router={mainRouter} />
}
