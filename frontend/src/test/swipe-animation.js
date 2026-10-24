// happy-dom 21 implements Web Animations, but its document timeline is not driven by
// Vitest's fake timers. Swipe tests use virtual time, so keep only the small Element.animate
// contract that useSwipeRow needs: a delayed onfinish and a harmless cancel.
export function installSwipeAnimationMock() {
  const prototype = HTMLElement.prototype
  const nativeAnimate = prototype.animate
  const animations = new Set()

  prototype.animate = function animate(_keyframes, options = {}) {
    let state = 'running'
    let onfinish = null
    let timer = setTimeout(() => animation.finish(), Number(options.duration) || 0)
    const animation = {
      get playState() { return state },
      get onfinish() { return onfinish },
      set onfinish(value) { onfinish = value },
      cancel() {
        if (state !== 'running') return
        state = 'idle'
        clearTimeout(timer)
        timer = null
      },
      finish() {
        if (state !== 'running') return
        state = 'finished'
        timer = null
        onfinish?.()
      },
    }
    animations.add(animation)
    return animation
  }

  return () => {
    for (const animation of animations) animation.cancel()
    animations.clear()
    prototype.animate = nativeAnimate
  }
}
