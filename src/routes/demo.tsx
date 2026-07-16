import { createFileRoute } from '@tanstack/react-router'
import GestureRecognizer from '@/components/GestureRecognizer'

export const Route = createFileRoute('/demo')({ component: DemoPage })

function DemoPage() {
    return <GestureRecognizer />
}
