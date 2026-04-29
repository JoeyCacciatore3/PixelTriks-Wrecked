export const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 0 && window.innerWidth < 1024)

export const isPortrait = () => window.innerHeight > window.innerWidth
