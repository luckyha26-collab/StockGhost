import { Chart as ChartJS } from 'chart.js/auto'
import { Bar, Doughnut, Line, Pie } from 'react-chartjs-2'
import { inr, inrShort } from './ui.jsx'

ChartJS.defaults.color = '#8592ad'
ChartJS.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif"
ChartJS.defaults.borderColor = 'rgba(133,146,173,.13)'
ChartJS.defaults.plugins.legend.labels.usePointStyle = true
ChartJS.defaults.plugins.legend.labels.boxWidth = 8
ChartJS.defaults.plugins.tooltip.backgroundColor = '#0b1120'
ChartJS.defaults.plugins.tooltip.borderColor = '#212d49'
ChartJS.defaults.plugins.tooltip.borderWidth = 1
ChartJS.defaults.plugins.tooltip.padding = 10
ChartJS.defaults.animation.duration = 600

export const C = { brand: '#34d3c1', violet: '#8b7cf6', amber: '#fbbf24', rose: '#f43f5e', orange: '#fb923c', green: '#34d399', blue: '#60a5fa' }

export const ChartBox = ({ height = 260, children }) => <div style={{ height }} className="relative">{children}</div>

const base = { responsive: true, maintainAspectRatio: false }
const moneyValue = (c) => (typeof c.parsed === 'number' ? c.parsed : c.chart.options.indexAxis === 'y' ? c.parsed.x : c.parsed.y)
const moneyTip = { callbacks: { label: (c) => ` ${c.dataset.label ? c.dataset.label + ': ' : ''}${inr(moneyValue(c))}` } }

export const MoneyBar = ({ data, horizontal = false, legend = false, stacked = false }) => (
  <Bar data={data} options={{
    ...base, indexAxis: horizontal ? 'y' : 'x',
    plugins: { legend: { display: legend }, tooltip: moneyTip },
    scales: {
      [horizontal ? 'x' : 'y']: { ticks: { callback: (v) => inrShort(v) }, beginAtZero: true, stacked },
      [horizontal ? 'y' : 'x']: { grid: { display: false }, stacked },
    },
  }} />
)

export const PlainBar = ({ data, horizontal = false, legend = false, max, tooltip }) => (
  <Bar data={data} options={{
    ...base, indexAxis: horizontal ? 'y' : 'x',
    plugins: { legend: { display: legend }, tooltip: tooltip || {} },
    scales: { [horizontal ? 'x' : 'y']: { beginAtZero: true, max }, [horizontal ? 'y' : 'x']: { grid: { display: false } } },
  }} />
)

export const MoneyLine = ({ data }) => (
  <Line data={data} options={{
    ...base, interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'bottom' }, tooltip: moneyTip },
    elements: { line: { tension: 0.35, borderWidth: 2 }, point: { radius: 2, hoverRadius: 5 } },
    scales: { y: { ticks: { callback: (v) => inrShort(v) }, beginAtZero: true }, x: { grid: { display: false } } },
  }} />
)

export const MoneyPie = ({ data, doughnut = false, money = true }) => {
  const Comp = doughnut ? Doughnut : Pie
  return (
    <Comp data={data} options={{
      ...base, cutout: doughnut ? '64%' : 0,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: (c) => ` ${c.label}: ${money ? inr(c.parsed) : c.parsed}` } },
      },
    }} />
  )
}
