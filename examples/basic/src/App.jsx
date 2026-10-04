import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { onValue, ref } from 'firebase/database'
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { auth, db, rtdb } from './firebase'
import './App.css'

function SignIn() {
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    try {
      await signInWithEmailAndPassword(auth, form.get('email'), form.get('password'))
    } catch (err) {
      setError(err.code || err.message)
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} aria-label="Sign in">
      <h2>Sign in</h2>
      <label>
        Email
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <button type="submit">Sign in</button>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}

function Projects({ user }) {
  const [projects, setProjects] = useState(null)
  const [name, setName] = useState('')

  useEffect(() => {
    const projectsQuery = query(
      collection(db, 'projects'),
      where('createdBy', '==', user.uid),
      orderBy('name'),
    )
    return onSnapshot(projectsQuery, (snap) =>
      setProjects(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
    )
  }, [user.uid])

  async function handleSubmit(event) {
    event.preventDefault()
    await addDoc(collection(db, 'projects'), {
      name,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
    })
    setName('')
  }

  return (
    <section className="card">
      <h2>Projects</h2>
      {projects === null ? (
        <p>Loading projects…</p>
      ) : projects.length === 0 ? (
        <p>No projects yet</p>
      ) : (
        <ul aria-label="Projects">
          {projects.map((project) => (
            <li key={project.id}>{project.name}</li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit} aria-label="New project">
        <input
          aria-label="Project name"
          placeholder="Project name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <button type="submit">Add project</button>
      </form>
    </section>
  )
}

function Announcement() {
  const [announcement, setAnnouncement] = useState(null)

  useEffect(
    () => onValue(ref(rtdb, 'announcement'), (snap) => setAnnouncement(snap.val())),
    [],
  )

  if (!announcement) {
    return null
  }
  return (
    <p className="announcement" role="status">
      {announcement.message}
    </p>
  )
}

export default function App() {
  // undefined while Firebase Auth restores the persisted user
  const [user, setUser] = useState(undefined)

  useEffect(() => onAuthStateChanged(auth, setUser), [])

  return (
    <main>
      <header>
        <h1>Projects</h1>
        {user && (
          <div className="user">
            <span data-testid="current-user">{user.email || user.uid}</span>
            <button type="button" onClick={() => signOut(auth)}>
              Sign out
            </button>
          </div>
        )}
      </header>
      {user === undefined ? (
        <p>Loading…</p>
      ) : user ? (
        <>
          <Announcement />
          <Projects user={user} />
        </>
      ) : (
        <SignIn />
      )}
    </main>
  )
}
