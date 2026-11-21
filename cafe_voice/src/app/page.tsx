'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MicOrb } from '@/components/MicOrb';
import { OrderTicket } from '@/components/OrderTicket';
import { OrderWithItems } from '@/types/cafe';
import { cn, formatCents } from '@/lib/utils';
import QRCode from 'qrcode';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function Home() {
  const [state, setState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!order?.id) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/order/${order.id}/status`);
        if (res.ok) {
          const data = await res.json();
          setOrder(data.order);
        }
      } catch {
        // ignore
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [order?.id]);

  useEffect(() => {
    if (order?.stripe_url) {
      QRCode.toDataURL(order.stripe_url, { width: 160, margin: 2 }).then(setQrDataUrl);
    }
  }, [order?.stripe_url]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      const userMsg: Message = { role: 'user', content: text };
      setMessages((prev) => [...prev, userMsg]);
      setState('thinking');

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [...messages, userMsg], order_id: order?.id }),
        });
        const data = await res.json();
        const assistantMsg: Message = { role: 'assistant', content: data.reply || "I'm sorry, I didn't catch that." };
        setMessages((prev) => [...prev, assistantMsg]);

        if (data.order_id && data.order_id !== order?.id) {
          const orderRes = await fetch(`/api/order/${data.order_id}/status`);
          if (orderRes.ok) {
            const orderData = await orderRes.json();
            setOrder(orderData.order);
          }
        } else if (order?.id) {
          const refreshed = await fetch(`/api/order/${order.id}/status`);
          if (refreshed.ok) {
            const orderData = await refreshed.json();
            setOrder(orderData.order);
          }
        }

        await speak(assistantMsg.content);
      } catch {
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }]);
        setState('idle');
      }
    },
    [messages, order?.id]
  );

  const speak = async (text: string) => {
    try {
      setState('speaking');
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('TTS failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setState('idle');
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch {
      setState('idle');
    }
  };

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;
        setAudioLevel(avg);
        rafRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((t) => t.stop());
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        setAudioLevel(0);
        setState('thinking');

        try {
          const formData = new FormData();
          formData.append('audio', blob, 'audio.webm');
          const res = await fetch('/api/stt', { method: 'POST', body: formData });
          const data = await res.json();
          if (data.text) {
            await sendMessage(data.text);
          } else {
            setState('idle');
          }
        } catch {
          setState('idle');
        }
      };

      mediaRecorder.start();
      setState('listening');
    } catch {
      setShowTextInput(true);
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const toggleListening = () => {
    if (state === 'listening') {
      stopListening();
    } else if (state === 'idle') {
      startListening();
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    sendMessage(textInput);
    setTextInput('');
  };

  const handleRemoveItem = async (lineId: string) => {
    if (!order) return;
    const res = await fetch('/api/order', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove_item', order_id: order.id, line_id: lineId }),
    });
    if (res.ok) {
      const data = await res.json();
      setOrder(data.order);
    }
  };

  const showPayCard = order?.status === 'payment_link_sent' || order?.status === 'paid' || order?.status === 'ready';

  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-4 py-6 text-foreground">
      <header className="mb-6 text-center">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground">Ember & Oat</h1>
        <p className="mt-1 text-sm text-muted">Tap the mic and order by voice</p>
      </header>

      <div className="flex w-full max-w-md flex-1 flex-col gap-4">
        <div className="flex flex-col items-center gap-2">
          <MicOrb state={state} onClick={toggleListening} audioLevel={audioLevel} />
          <p className="text-xs text-muted">
            {state === 'idle' && 'Tap to speak'}
            {state === 'listening' && 'Listening... tap to stop'}
            {state === 'thinking' && 'Remy is thinking...'}
            {state === 'speaking' && 'Remy is speaking...'}
          </p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border bg-surface p-4 shadow-inner">
          {messages.length === 0 && (
            <p className="text-center text-sm text-muted">Try: &ldquo;A large oat latte and a cinnamon bun&rdquo;</p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                'max-w-[85%] rounded-xl px-4 py-2 text-sm',
                m.role === 'user' ? 'ml-auto bg-accent-soft text-accent' : 'mr-auto bg-sage/10 text-sage'
              )}
            >
              {m.content}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <AnimatePresence>
          {order && !showPayCard && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
              <OrderTicket order={order} onRemoveItem={handleRemoveItem} compact />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {order?.status === 'sent_to_kitchen' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl border border-border bg-surface p-6 text-center shadow-sm"
            >
              <div className="mx-auto mb-3 h-8 w-8 animate-pulse rounded-full bg-amber-500/20" />
              <p className="font-medium text-foreground">Waiting for the kitchen to confirm…</p>
              <p className="mt-1 text-xs text-muted">No payment until staff confirm your order.</p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showPayCard && order && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="font-serif text-lg font-semibold">{order.order_number}</p>
                <span className="rounded bg-[#635BFF]/10 px-2 py-0.5 text-xs font-medium text-[#635BFF]">Test mode</span>
              </div>
              <p className="mt-1 text-muted">Pay {formatCents(order.total_amount)}</p>
              {qrDataUrl && (
                <div className="mt-4 flex justify-center">
                  <img src={qrDataUrl} alt="Payment QR code" className="h-40 w-40 rounded-lg border border-border" />
                </div>
              )}
              <a
                href={order.stripe_url || '#'}
                target="_blank"
                rel="noreferrer"
                className="mt-4 block w-full rounded-xl bg-[#635BFF] py-3 text-center text-sm font-medium text-white hover:bg-[#4f49cc]"
              >
                Pay {formatCents(order.total_amount)} (test)
              </a>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {order?.status === 'ready' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border border-sage/30 bg-sage/10 p-6 text-center"
            >
              <motion.svg
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                className="mx-auto h-10 w-10 text-sage"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <motion.path d="M5 13l4 4L19 7" />
              </motion.svg>
              <p className="mt-3 font-medium text-sage">Your {order.order_number} is ready!</p>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setShowTextInput((s) => !s)}
          className="self-center text-xs text-muted underline underline-offset-2"
        >
          {showTextInput ? 'Hide keyboard' : 'Type instead'}
        </button>

        <AnimatePresence>
          {showTextInput && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              onSubmit={handleTextSubmit}
              className="flex w-full gap-2"
            >
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type your order..."
                className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button type="submit" className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover">
                Send
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

