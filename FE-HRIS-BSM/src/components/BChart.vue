<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import {
  Chart,
  BarController,
  LineController,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

Chart.register(
  BarController,
  LineController,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler
);

const props = withDefaults(
  defineProps<{
    type: "bar" | "line";
    labels: string[];
    datasets: { label: string; data: number[]; color?: string; fill?: boolean }[];
    height?: number;
  }>(),
  { type: "bar", labels: () => [], datasets: () => [], height: 260 }
);

const canvasRef = ref<HTMLCanvasElement | null>(null);
let chart: Chart | null = null;

function render() {
  if (!canvasRef.value) return;
  if (chart) chart.destroy();
  chart = new Chart(canvasRef.value, {
    type: props.type,
    data: {
      labels: props.labels,
      datasets: props.datasets.map((d) => ({
        label: d.label,
        data: d.data,
        backgroundColor: d.fill ? d.color + "55" : d.color,
        borderColor: d.color,
        borderWidth: 1.5,
        fill: d.fill ?? false,
        tension: 0.35,
        pointRadius: 3,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            font: { family: "Plus Jakarta Sans", size: 11 },
          },
        },
      },
      scales: {
        x: {
          ticks: { font: { family: "Plus Jakarta Sans", size: 10 } },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0, font: { family: "Plus Jakarta Sans", size: 10 } },
          grid: { color: "rgba(0,0,0,0.06)" },
        },
      },
    },
  });
}

watch(
  () => [props.labels, props.datasets],
  () => render(),
  { deep: true }
);

onMounted(render);
onBeforeUnmount(() => {
  if (chart) {
    chart.destroy();
    chart = null;
  }
});
</script>

<template>
  <div :style="{ height: height + 'px' }">
    <canvas ref="canvasRef"></canvas>
  </div>
</template>