'use client'

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'hem-chat-history'

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  productCards?: {
    sku: string
    name: string
    colour: string
    price: number
    image: string
    sizes: string[]
  }[]
  isOpeningMessage?: boolean
}

export function useChatHistory(initialMessages: ChatMessage[] = []) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === 'undefined') return initialMessages
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as ChatMessage[]
        return parsed.length > 0 ? parsed : initialMessages
      }
    } catch {
      // sessionStorage unavailable or malformed
    }
    return initialMessages
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    } catch {
      // sessionStorage full or unavailable
    }
  }, [messages])

  const addMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => [...prev, message])
  }, [])

  const clearHistory = useCallback(() => {
    setMessages([])
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [])

  const hasRestoredSession = messages.length > 0 && messages[0]?.isOpeningMessage !== true

  return { messages, setMessages, addMessage, clearHistory, hasRestoredSession }
}
