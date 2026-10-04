import { expect, test } from 'playwright-firebase'

test.describe('auth', () => {
  test('shows the sign in form when signed out', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('form', { name: 'Sign in' })).toBeVisible()
  })

  test('login signs the app in as a uid before it loads', async ({ page, login }, testInfo) => {
    const uid = `user-${testInfo.testId}`
    await login({ uid })
    await page.goto('/')
    await expect(page.getByTestId('current-user')).toHaveText(uid)
  })

  test('login reloads an app which is already open', async ({ page, login }, testInfo) => {
    await page.goto('/')
    await expect(page.getByRole('form', { name: 'Sign in' })).toBeVisible()
    const uid = `user-${testInfo.testId}`
    await login({ uid })
    await expect(page.getByTestId('current-user')).toHaveText(uid)
  })

  test('login with email and password', async ({ page, firebase, login }, testInfo) => {
    const email = `${testInfo.testId}@example.com`
    await firebase.auth.createUser({ email, password: 'password123' })
    await login({ email, password: 'password123', url: '/' })
    await expect(page.getByTestId('current-user')).toHaveText(email)
  })

  test('signs in through the UI with a user created by firebase-admin', async ({ page, firebase }, testInfo) => {
    const email = `ui-${testInfo.testId}@example.com`
    await firebase.auth.createUser({ email, password: 'password123' })
    await page.goto('/')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByTestId('current-user')).toHaveText(email)
  })

  test('logout signs the app out', async ({ page, login, logout }, testInfo) => {
    await login({ uid: `user-${testInfo.testId}`, url: '/' })
    await expect(page.getByTestId('current-user')).toBeVisible()
    await logout()
    await expect(page.getByRole('form', { name: 'Sign in' })).toBeVisible()
  })

  test('login state can be saved and reused with storageState', async ({ page, browser, login }, testInfo) => {
    const uid = `user-${testInfo.testId}`
    await login({ uid, url: '/' })
    await expect(page.getByTestId('current-user')).toHaveText(uid)
    const storageState = await page.context().storageState({ indexedDB: true })

    const context = await browser.newContext({ storageState })
    const reusedPage = await context.newPage()
    await reusedPage.goto('/')
    await expect(reusedPage.getByTestId('current-user')).toHaveText(uid)
    await context.close()
  })
})
