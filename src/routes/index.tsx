import { createFileRoute } from '@tanstack/react-router'
import HandTracker from '@/components/HandTracker'

export const Route = createFileRoute('/')({ component: IndexPage })

function IndexPage() {
  return <HandTracker />
}
