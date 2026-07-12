import { onBeforeUnmount, onMounted, ref } from 'vue'

const BREAKPOINT = 768

/** Reflete a mesma convenção de breakpoint mobile (768px) usada em @media (max-width: 767px). */
export function useIsMobile() {
  const isMobile = ref(typeof window !== 'undefined' ? window.innerWidth < BREAKPOINT : false)

  function onResize() {
    isMobile.value = window.innerWidth < BREAKPOINT
  }

  onMounted(() => window.addEventListener('resize', onResize))
  onBeforeUnmount(() => window.removeEventListener('resize', onResize))

  return { isMobile }
}
