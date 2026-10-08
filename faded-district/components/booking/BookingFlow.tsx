'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { business } from '@/data/business';
import { services, formatPrice, getService } from '@/data/services';
import { barbers, getBarber } from '@/data/barbers';
import { getDays, getSlots } from '@/lib/booking/slots';
import { getBookingProvider, type BookingResult } from '@/lib/booking/providers';
import { useSound } from '@/lib/sound';
import type { Prefill } from './BookingProvider';

const STEPS = ['Service', 'Barber', 'Time', 'Details'] as const;
const PHONE_RE = /^(?:\+?61|0)4\d{8}$/;

const radioCard = 'group relative flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-white/10 bg-ink/60 p-4 text-left transition-colors hover:border-white/30 has-[:checked]:border-gold has-[:checked]:bg-gold/10 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold';

export function BookingFlow({ initial = {}, onClose }: { initial?: Prefill; onClose?: () => void }) {
  const { play } = useSound();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(initial.serviceId ? (initial.barberId ? 2 : 1) : 0);
  const [dir, setDir] = useState(1);
  const [serviceId, setServiceId] = useState(initial.serviceId ?? '');
  const [barberId, setBarberId] = useState(initial.barberId ?? (initial.serviceId ? 'any' : ''));
  const [dayIso, setDayIso] = useState('');
  const [time, setTime] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [copied, setCopied] = useState(false);

  const days = useMemo(() => getDays(14), []);
  const day = days.find((d) => d.iso === dayIso) ?? null;
  const slots = useMemo(() => (day ? getSlots(day) : []), [day]);
  const service = getService(serviceId);
  const barber = barberId === 'any' ? null : getBarber(barberId);

  // Default to the first day that still has an open slot
  useEffect(() => {
    if (!dayIso) {
      const first = days.find((d) => getSlots(d).some((s) => !s.disabled));
      if (first) setDayIso(first.iso);
    }
  }, [days, dayIso]);

  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [step, result]);

  const phoneOk = PHONE_RE.test(phone.replace(/\s|-/g, ''));
  const nameOk = name.trim().length >= 2;
  const canNext = [!!service, !!barberId, !!day && !!time, nameOk && phoneOk][step];

  const go = (n: number) => { setDir(n > step ? 1 : -1); setStep(n); };
  const next = async () => {
    play(160);
    if (step < 3) { go(step + 1); return; }
    setTouched(true);
    if (!canNext || !service || !day) return;
    const res = await getBookingProvider().submit({ service, barber, dateISO: day.iso, dateLabel: day.long, time, name: name.trim(), phone });
    setResult(res);
  };

  const onSubmit = (e: React.FormEvent) => { e.preventDefault(); if (canNext) next(); };

  const variants = { enter: (d: number) => ({ opacity: 0, x: 40 * d, filter: 'blur(8px)' }), center: { opacity: 1, x: 0, filter: 'blur(0px)' }, exit: (d: number) => ({ opacity: 0, x: -40 * d, filter: 'blur(8px)' }) };

  if (result) {
    return (
      <div aria-live="polite">
        <p className="eyebrow">Request ready</p>
        <h2 ref={headingRef} tabIndex={-1} className="display h-lg mt-3 outline-none">ONE TAP TO SEND</h2>
        {result.kind === 'sms' && (
          <>
            <p className="mt-4 text-chrome">We’ll open your messages with this note to {business.phone}. Hit send and we’ll confirm your time.</p>
            <blockquote className="mt-5 rounded-2xl border border-gold/30 bg-gold/5 p-5 text-lg leading-snug text-bone">{result.message}</blockquote>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <a href={result.href} className="btn btn-gold flex-1" onClick={() => play(500)}>Open Messages</a>
              <a href={`tel:${business.phoneTel}`} className="btn btn-ghost flex-1">Call instead</a>
            </div>
            <button
              className="mt-4 text-sm text-steel underline underline-offset-4 hover:text-gold"
              onClick={async () => { try { await navigator.clipboard.writeText(result.message); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} }}
            >{copied ? 'Copied ✓' : 'Copy message'}</button>
          </>
        )}
        {result.kind === 'redirect' && (
          <>
            <p className="mt-4 text-chrome">{result.message}</p>
            <a href={result.url} className="btn btn-gold mt-6 w-full">Continue to booking</a>
          </>
        )}
        {result.kind === 'done' && <p className="mt-4 text-chrome">{result.message}</p>}
        <div className="mt-6 flex gap-4 text-sm">
          <button className="text-steel underline underline-offset-4 hover:text-gold" onClick={() => setResult(null)}>← Edit request</button>
          {onClose && <button className="text-steel underline underline-offset-4 hover:text-gold" onClick={onClose}>Close</button>}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {/* Progress */}
      <div className="pr-14" aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
        <div className="flex items-center gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step + 1}>
          {STEPS.map((s, i) => (
            <div key={s} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full bg-gold" initial={false} animate={{ width: i <= step ? '100%' : '0%' }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
            </div>
          ))}
        </div>
        <p className="eyebrow mt-4">Step {step + 1} / 4 · {STEPS[step]}</p>
      </div>

      <div className="relative mt-3 min-h-[360px]">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div key={step} custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
            {step === 0 && (
              <fieldset>
                <legend><h2 ref={headingRef} tabIndex={-1} className="display h-lg outline-none">CHOOSE YOUR CUT</h2></legend>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {services.map((s) => (
                    <label key={s.id} className={radioCard}>
                      <input type="radio" name="service" value={s.id} checked={serviceId === s.id} onChange={() => setServiceId(s.id)} className="sr-only" />
                      <span><span className="block font-semibold text-bone">{s.name}</span><span className="text-sm text-steel">{s.duration} min</span></span>
                      <span className="display text-2xl text-gold">{formatPrice(s.price)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {step === 1 && (
              <fieldset>
                <legend><h2 ref={headingRef} tabIndex={-1} className="display h-lg outline-none">WHO’S CUTTING?</h2></legend>
                <div className="mt-6 grid gap-3">
                  {[{ id: 'any', name: 'Anyone available', sub: 'Fastest to get in the chair' }, ...barbers.map((b) => ({ id: b.id, name: b.name, sub: b.specialty }))].map((b) => (
                    <label key={b.id} className={radioCard}>
                      <input type="radio" name="barber" value={b.id} checked={barberId === b.id} onChange={() => setBarberId(b.id)} className="sr-only" />
                      <span><span className="block font-semibold text-bone">{b.name}</span><span className="text-sm text-steel">{b.sub}</span></span>
                      <span aria-hidden className="h-4 w-4 rounded-full border border-white/30 group-has-[:checked]:border-gold group-has-[:checked]:bg-gold" />
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {step === 2 && (
              <div>
                <h2 ref={headingRef} tabIndex={-1} className="display h-lg outline-none">PICK A TIME</h2>
                <p className="mt-2 text-sm text-steel">Sydney time · within opening hours</p>
                <fieldset className="mt-5">
                  <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-steel">Day</legend>
                  <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
                    {days.map((d) => (
                      <label key={d.iso} className="shrink-0">
                        <input type="radio" name="day" value={d.iso} checked={dayIso === d.iso} onChange={() => { setDayIso(d.iso); setTime(''); }} className="peer sr-only" />
                        <span className="flex h-[72px] w-[68px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-white/10 bg-ink/60 text-xs uppercase tracking-wider text-steel transition-colors peer-checked:border-gold peer-checked:bg-gold peer-checked:text-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-gold">
                          <span>{d.label}</span><span className="display text-xl">{d.long.split(' ')[1]}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="mt-5">
                  <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-steel">Preferred time</legend>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slots.map((s) => (
                      <label key={s.time} className={s.disabled ? 'opacity-30' : ''}>
                        <input type="radio" name="time" value={s.time} disabled={s.disabled} checked={time === s.time} onChange={() => setTime(s.time)} className="peer sr-only" />
                        <span className="flex h-11 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-ink/60 text-sm transition-colors peer-checked:border-gold peer-checked:bg-gold peer-checked:text-ink peer-disabled:cursor-not-allowed peer-disabled:line-through peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-gold">{s.time}</span>
                      </label>
                    ))}
                  </div>
                  {slots.every((s) => s.disabled) && <p className="mt-3 text-sm text-steel">No more times today. Choose another day.</p>}
                </fieldset>
              </div>
            )}
            {step === 3 && (
              <div>
                <h2 ref={headingRef} tabIndex={-1} className="display h-lg outline-none">YOUR DETAILS</h2>
                <p className="mt-2 text-sm text-steel">{service?.name} · {barber?.name ?? 'Anyone available'} · {day?.long} around {time}</p>
                <div className="mt-6 grid gap-5">
                  <div>
                    <label htmlFor="bk-name" className="text-xs font-semibold uppercase tracking-[0.18em] text-steel">Name</label>
                    <input id="bk-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={touched && !nameOk} aria-describedby="bk-name-err" className="mt-2 h-14 w-full rounded-xl border border-white/15 bg-ink px-4 text-lg text-bone placeholder:text-steel/60 focus:border-gold focus:outline-none" placeholder="Your name" />
                    <p id="bk-name-err" className="mt-1 min-h-5 text-sm text-red-300">{touched && !nameOk ? 'Please enter your name.' : ''}</p>
                  </div>
                  <div>
                    <label htmlFor="bk-phone" className="text-xs font-semibold uppercase tracking-[0.18em] text-steel">Mobile number</label>
                    <input id="bk-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={touched && !phoneOk} aria-describedby="bk-phone-err" className="mt-2 h-14 w-full rounded-xl border border-white/15 bg-ink px-4 text-lg text-bone placeholder:text-steel/60 focus:border-gold focus:outline-none" placeholder="04xx xxx xxx" />
                    <p id="bk-phone-err" className="mt-1 min-h-5 text-sm text-red-300">{touched && !phoneOk ? 'Enter an Australian mobile, e.g. 0412 345 678.' : ''}</p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-8 flex items-center justify-between gap-3 border-t border-white/10 pt-6">
        <button type="button" onClick={() => go(step - 1)} disabled={step === 0} className="btn btn-ghost min-h-[48px] px-5 disabled:invisible">Back</button>
        <div className="flex items-center gap-3">
          <a href={`tel:${business.phoneTel}`} className="hidden text-sm text-steel underline underline-offset-4 hover:text-gold sm:inline">Call instead</a>
          <button type="submit" className="btn btn-gold min-h-[48px]" disabled={!canNext && step < 3}>{step === 3 ? 'Create request' : 'Continue'}</button>
        </div>
      </div>
    </form>
  );
}
