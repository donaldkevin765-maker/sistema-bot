import type { InferGetServerSidePropsType, GetServerSideProps } from "next"
import Head from "next/head"
import { useEffect, useState } from "react"
import { db, ref, onValue, off } from "../lib/firebase"

type BotData = {
  bot_id: number
  username: string
  piattaforma: string
  stato: string
  data_creazione: string
  ultimo_heartbeat: string
  error_count: number
  login_count: number
}

type ActivityData = {
  azione_id: number
  bot_id: number
  tipo_azione: string
  timestamp: string
  success: number
}

type Stats = {
  totale_bot: number
  per_stato: Record<string, number>
  per_piattaforma: Record<string, number>
}

export const getServerSideProps: GetServerSideProps<{ firebaseConfigured: boolean }> = async () => {
  return {
    props: {
      firebaseConfigured: !!process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    },
  }
}

function BotCard({ bot }: { bot: BotData }) {
  const statoColor: Record<string, string> = {
    WARMING: "bg-yellow-100 border-yellow-400 text-yellow-800",
    READY: "bg-green-100 border-green-400 text-green-800",
    BANNED: "bg-red-100 border-red-400 text-red-800",
    ERROR: "bg-orange-100 border-orange-400 text-orange-800",
  }
  const color = statoColor[bot.stato] || "bg-gray-100 border-gray-400"

  return (
    <div className={`border-l-4 p-3 rounded ${color}`}>
      <div className="flex justify-between items-start">
        <div>
          <span className="font-mono font-bold">#{bot.bot_id}</span>
          <span className="ml-2 text-sm">{bot.username}</span>
        </div>
        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white/50">{bot.stato}</span>
      </div>
      <div className="text-xs mt-1 text-gray-600">
        {bot.piattaforma} · errori: {bot.error_count} · login: {bot.login_count}
      </div>
    </div>
  )
}

function ActivityRow({ a }: { a: ActivityData }) {
  const ok = a.success === 1
  return (
    <tr className={`text-xs ${ok ? "" : "bg-red-50"}`}>
      <td className="py-1 px-2 font-mono">#{a.bot_id}</td>
      <td className="py-1 px-2">{a.tipo_azione}</td>
      <td className="py-1 px-2">
        <span className={ok ? "text-green-600" : "text-red-600"}>{ok ? "OK" : "FAIL"}</span>
      </td>
      <td className="py-1 px-2 text-gray-500">{new Date(a.timestamp).toLocaleTimeString()}</td>
    </tr>
  )
}

function StatBox({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className={`${color} rounded-lg p-4 text-white`}>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-sm opacity-80">{label}</div>
    </div>
  )
}

export default function Home({ firebaseConfigured }: { firebaseConfigured: boolean }) {
  const [bots, setBots] = useState<BotData[]>([])
  const [activities, setActivities] = useState<ActivityData[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!firebaseConfigured) return

    const botsRef = ref(db, "bots")
    const unsubBots = onValue(botsRef, (snap) => {
      const data = snap.val()
      if (data) setBots(Object.values(data))
      setConnected(true)
    })

    const activityRef = ref(db, "attivita")
    const unsubAct = onValue(activityRef, (snap) => {
      const data = snap.val()
      if (data) {
        const list: ActivityData[] = Object.values(data)
        setActivities(list.slice(-50).reverse())
      }
    })

    return () => {
      off(botsRef)
      off(activityRef)
    }
  }, [firebaseConfigured])

  useEffect(() => {
    if (bots.length > 0) {
      const per_stato: Record<string, number> = {}
      const per_piattaforma: Record<string, number> = {}
      for (const b of bots) {
        per_stato[b.stato] = (per_stato[b.stato] || 0) + 1
        per_piattaforma[b.piattaforma] = (per_piattaforma[b.piattaforma] || 0) + 1
      }
      setStats({ totale_bot: bots.length, per_stato, per_piattaforma })
    }
  }, [bots])

  if (!firebaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">⚙️ Configura Firebase</h1>
          <p>Aggiungi le variabili d'ambiente su Vercel:</p>
          <pre className="mt-4 bg-gray-800 p-4 rounded text-left text-sm">
            NEXT_PUBLIC_FIREBASE_API_KEY=...<br />
            NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...<br />
            NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://...<br />
            NEXT_PUBLIC_FIREBASE_PROJECT_ID=...<br />
            NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
          </pre>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Sistema Bot — Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <header className="bg-gray-900 text-white p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">🤖 Sistema Bot</h1>
          <div className="flex items-center gap-2 text-sm">
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
            {connected ? "Firebase connesso" : "In attesa..."}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4">
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatBox label="Totale Bot" value={stats.totale_bot} color="bg-blue-600" />
            {Object.entries(stats.per_stato).map(([stato, count]) => (
              <StatBox key={stato} label={stato} value={count} color={
                stato === "WARMING" ? "bg-yellow-500" :
                stato === "READY" ? "bg-green-600" :
                stato === "BANNED" ? "bg-red-600" : "bg-gray-600"
              } />
            ))}
            {Object.entries(stats.per_piattaforma).slice(0, 3).map(([p, count]) => (
              <StatBox key={p} label={p} value={count} color="bg-purple-600" />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section>
            <h2 className="text-lg font-semibold mb-3">Bot ({bots.length})</h2>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {bots.map((b) => <BotCard key={b.bot_id} bot={b} />)}
              {bots.length === 0 && <p className="text-gray-500">Nessun bot nel database...</p>}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">Attività recenti</h2>
            <div className="bg-white rounded-lg border max-h-[600px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="py-2 px-2 text-left text-xs">Bot</th>
                    <th className="py-2 px-2 text-left text-xs">Azione</th>
                    <th className="py-2 px-2 text-left text-xs">Stato</th>
                    <th className="py-2 px-2 text-left text-xs">Ora</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map((a) => <ActivityRow key={a.azione_id} a={a} />)}
                  {activities.length === 0 && (
                    <tr><td className="py-4 text-center text-gray-500" colSpan={4}>Nessuna attività...</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
