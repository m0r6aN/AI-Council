"use client"

import dynamic from "next/dynamic"

const ConnectionStatus = dynamic(() => import("./connection-status"), {
  ssr: false,
})

export function ConnectionStatusWrapper() {
  return <ConnectionStatus />
}

