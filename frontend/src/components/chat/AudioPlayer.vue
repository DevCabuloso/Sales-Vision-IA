<template>
  <div class="audio-player">
    <button type="button" class="audio-player-toggle" @click="toggle" :aria-label="playing ? 'Pausar' : 'Reproduzir'">
      <v-icon :icon="playing ? 'mdi-pause' : 'mdi-play'" size="18" />
    </button>
    <input
      type="range" class="audio-player-seek"
      min="0" :max="totalSeconds || 0" step="0.1"
      :value="currentTime"
      @input="onSeek"
    />
    <span class="audio-player-time">{{ formatDuration(playing || currentTime > 0 ? currentTime : totalSeconds) }}</span>
    <audio
      ref="audioEl" :src="src" preload="metadata"
      @timeupdate="onTimeUpdate" @loadedmetadata="onLoadedMetadata" @ended="onEnded"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  src: { type: String, required: true },
  duration: { type: Number, default: null },
})

const audioEl = ref(null)
const playing = ref(false)
const currentTime = ref(0)
const nativeDuration = ref(0)

// Duração informada pelo servidor (contada durante a gravação) é a fonte da
// verdade — o valor nativo do <audio> só serve de fallback para áudios sem
// essa metadata (ex: mensagens antigas, ou recebidas direto do WhatsApp).
const totalSeconds = computed(() => {
  if (Number.isFinite(props.duration) && props.duration > 0) return props.duration
  return Number.isFinite(nativeDuration.value) ? nativeDuration.value : 0
})

function formatDuration(seconds) {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function toggle() {
  if (!audioEl.value) return
  if (playing.value) {
    audioEl.value.pause()
  } else {
    audioEl.value.play()
  }
  playing.value = !playing.value
}

function onTimeUpdate() {
  currentTime.value = audioEl.value?.currentTime || 0
}

function onLoadedMetadata() {
  const d = audioEl.value?.duration
  nativeDuration.value = Number.isFinite(d) ? d : 0
}

function onSeek(e) {
  const value = Number(e.target.value)
  currentTime.value = value
  if (audioEl.value) audioEl.value.currentTime = value
}

function onEnded() {
  playing.value = false
  currentTime.value = 0
}
</script>

<style scoped>
.audio-player {
  display: flex; align-items: center; gap: 8px;
  min-width: 220px; padding: 4px 2px;
}
.audio-player-toggle {
  flex-shrink: 0; width: 30px; height: 30px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.14); border: none; cursor: pointer;
  color: inherit;
}
.audio-player-toggle:hover { background: rgba(255,255,255,0.22); }
.audio-player-seek { flex: 1; accent-color: currentColor; cursor: pointer; }
.audio-player-time { flex-shrink: 0; font-size: 11px; opacity: 0.75; min-width: 32px; text-align: right; }
</style>
