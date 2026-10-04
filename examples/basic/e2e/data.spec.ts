import { expect, test } from 'playwright-firebase'

test.describe('data', () => {
  // Unique per test so tests can run in parallel against shared emulators
  let uid: string
  test.beforeEach(() => {
    uid = `user-${test.info().testId}`
  })

  test.afterEach(async ({ firebase }) => {
    await firebase.callFirestore('delete', 'projects', {
      where: ['createdBy', '==', uid],
    })
  })

  test('shows projects seeded with callFirestore', async ({ page, firebase, login }) => {
    await firebase.callFirestore('batch', 'projects', [
      { action: 'add', data: { name: 'Beta', createdBy: uid } },
      { action: 'add', data: { name: 'Alpha', createdBy: uid } },
      // Belongs to someone else, so security rules and the query hide it
      { action: 'add', data: { name: 'Other', createdBy: 'someone-else' } },
    ])
    await login({ uid, url: '/' })
    await expect(page.getByRole('list', { name: 'Projects' }).getByRole('listitem')).toHaveText([
      'Alpha',
      'Beta',
    ])
  })

  test('saves projects created in the UI to Firestore', async ({ page, firebase, login }) => {
    await login({ uid, url: '/' })
    await expect(page.getByText('No projects yet')).toBeVisible()
    await page.getByLabel('Project name').fill('Launch')
    await page.getByRole('button', { name: 'Add project' }).click()
    await expect(page.getByRole('listitem')).toHaveText(['Launch'])

    const projects = await firebase.callFirestore('get', 'projects', {
      where: ['createdBy', '==', uid],
    })
    expect(projects).toEqual([
      expect.objectContaining({ id: expect.any(String), name: 'Launch', createdBy: uid }),
    ])
  })

  test('shows the announcement from the Realtime Database', async ({ page, firebase, login }) => {
    await firebase.callRtdb('set', 'announcement', { message: 'Hello from RTDB' })
    await login({ uid, url: '/' })
    await expect(page.getByRole('status')).toHaveText('Hello from RTDB')
    await firebase.callRtdb('update', 'announcement', { message: 'Updated live' })
    await expect(page.getByRole('status')).toHaveText('Updated live')
  })
})
