import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'
import type { Transition } from './nav-store'

/**
 * Directional slide + fade between wizard pages. The travel axis follows the
 * arrow the user pressed (right arrow slides horizontally, down arrow slides
 * vertically); back navigation reverses automatically.
 */

const TRAVEL = 56

const variants = {
  enter: ({ dir, axis }: Transition) => ({
    opacity: 0,
    x: axis === 'x' ? TRAVEL * dir : 0,
    y: axis === 'y' ? TRAVEL * dir : 0
  }),
  center: { opacity: 1, x: 0, y: 0 },
  exit: ({ dir, axis }: Transition) => ({
    opacity: 0,
    x: axis === 'x' ? -TRAVEL * dir : 0,
    y: axis === 'y' ? -TRAVEL * dir : 0
  })
}

export function PageTransition(props: {
  routeKey: string
  transition: Transition
  children: ReactNode
}): React.JSX.Element {
  return (
    <AnimatePresence mode="wait" custom={props.transition} initial={false}>
      <motion.div
        key={props.routeKey}
        custom={props.transition}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.28, ease: [0.32, 0, 0.15, 1] }}
        style={{ position: 'absolute', inset: 0 }}
      >
        {props.children}
      </motion.div>
    </AnimatePresence>
  )
}
