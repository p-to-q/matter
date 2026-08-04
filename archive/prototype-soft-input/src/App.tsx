import { useState, type ComponentType } from 'react'
import {
  HandGrab,
  LassoSelect,
  MoveHorizontal,
  PenLine,
  Scaling,
  Sparkles,
  TextCursorInput,
} from 'lucide-react'

type ToolId = 'hand' | 'circle' | 'scale' | 'text' | 'stretch' | 'draw' | 'spark'
type PaletteVariantId =
  | 'rail'
  | 'grid'
  | 'handle'
  | 'split'
  | 'marker-rail'
  | 'offset-rail'
  | 'grip-strip'
  | 'grip-capsule'

interface ToolDefinition {
  label: string
  Icon: ComponentType<{ size?: number; strokeWidth?: number }>
}

interface PaletteStudyDefinition {
  id: PaletteVariantId
  title: string
  note: string
  tools: ToolId[]
  defaultTool: ToolId
}

const toolLibrary: Record<ToolId, ToolDefinition> = {
  hand: { label: 'Pan the canvas', Icon: HandGrab },
  circle: { label: 'Circle a thought', Icon: LassoSelect },
  scale: { label: 'Scale the selection', Icon: Scaling },
  text: { label: 'Place text', Icon: TextCursorInput },
  stretch: { label: 'Stretch language', Icon: MoveHorizontal },
  draw: { label: 'Draw a mark', Icon: PenLine },
  spark: { label: 'Invite a variation', Icon: Sparkles },
}

// This list is append-only: every further study gets added here instead of replacing an earlier one.
const paletteStudies: PaletteStudyDefinition[] = [
  {
    id: 'rail',
    title: 'Single rail',
    note: 'A hand above a quiet stack of mark-making tools.',
    tools: ['hand', 'circle', 'scale', 'text'],
    defaultTool: 'scale',
  },
  {
    id: 'grid',
    title: 'Two-column field',
    note: 'The dense, familiar toolbox from older drawing software.',
    tools: ['hand', 'circle', 'scale', 'text'],
    defaultTool: 'circle',
  },
  {
    id: 'handle',
    title: 'Grip cassette',
    note: 'A movable physical object: grip first, instruments below.',
    tools: ['hand', 'circle', 'scale', 'text'],
    defaultTool: 'hand',
  },
  {
    id: 'split',
    title: 'Split tray',
    note: 'Navigation is held apart from the tools that leave a trace.',
    tools: ['hand', 'circle', 'scale', 'text'],
    defaultTool: 'text',
  },
  {
    id: 'marker-rail',
    title: 'Marker rail',
    note: 'The rail stays pure; the active action is only a small orange mark.',
    tools: ['hand', 'circle', 'stretch', 'text'],
    defaultTool: 'stretch',
  },
  {
    id: 'offset-rail',
    title: 'Offset hand',
    note: 'The hand becomes a mode switch; the rest remains a slim instrument line.',
    tools: ['hand', 'circle', 'scale', 'draw'],
    defaultTool: 'draw',
  },
  {
    id: 'grip-strip',
    title: 'Grip strip',
    note: 'A thumb-sized grab surface along the edge, made for direct manipulation.',
    tools: ['hand', 'circle', 'stretch', 'spark'],
    defaultTool: 'spark',
  },
  {
    id: 'grip-capsule',
    title: 'Grip capsule',
    note: 'A compact, rounded cassette with two modes visible at once.',
    tools: ['hand', 'scale', 'text', 'spark'],
    defaultTool: 'scale',
  },
]

interface ToolButtonProps {
  toolId: ToolId
  activeTool: ToolId
  onSelect: (tool: ToolId) => void
  emphasis?: boolean
}

function ToolButton({ toolId, activeTool, onSelect, emphasis = false }: ToolButtonProps) {
  const { Icon, label } = toolLibrary[toolId]

  return (
    <button
      type="button"
      className={`tool-palette__button ${activeTool === toolId ? 'is-active' : ''} ${emphasis ? 'tool-palette__button--hand' : ''}`}
      aria-label={label}
      aria-pressed={activeTool === toolId}
      title={label}
      onClick={() => onSelect(toolId)}
    >
      <Icon size={emphasis ? 21 : 19} strokeWidth={1.65} />
    </button>
  )
}

function Grip({ orientation = 'horizontal' }: { orientation?: 'horizontal' | 'vertical' }) {
  return (
    <span className={`tool-palette__grip tool-palette__grip--${orientation}`} aria-label="Move toolbox" role="img">
      <i /><i /><i /><i /><i /><i />
    </span>
  )
}

function PaletteStudy({ study }: { study: PaletteStudyDefinition }) {
  const [activeTool, setActiveTool] = useState<ToolId>(study.defaultTool)
  const [hand, ...instruments] = study.tools
  const usesTopGrip = study.id === 'handle' || study.id === 'grip-capsule'
  const usesSideGrip = study.id === 'grip-strip'
  const isSplit = study.id === 'split' || study.id === 'offset-rail'

  return (
    <article className="palette-study">
      <div className="palette-study__stage">
        <nav className={`tool-palette tool-palette--${study.id}`} aria-label={`${study.title} controls`}>
          {usesTopGrip && <Grip />}
          {usesSideGrip && <Grip orientation="vertical" />}

          <div className="tool-palette__primary">
            <ToolButton toolId={hand} activeTool={activeTool} onSelect={setActiveTool} emphasis />
          </div>

          {!isSplit && <span className="tool-palette__divider" aria-hidden="true" />}

          <div className="tool-palette__tools">
            {instruments.map((toolId) => (
              <ToolButton key={toolId} toolId={toolId} activeTool={activeTool} onSelect={setActiveTool} />
            ))}
          </div>

          {study.id === 'marker-rail' && <span className="tool-palette__marker" aria-hidden="true" />}
        </nav>
      </div>

      <div className="palette-study__caption">
        <h2>{study.title}</h2>
        <p>{study.note}</p>
      </div>
    </article>
  )
}

function App() {
  return (
    <main className="toolbox-page">
      <header className="toolbox-page__header">
        <p>Toolbox studies</p>
        <h1>Ways to hold a tool.</h1>
        <span>Each box is live. Choose an action and compare the feeling.</span>
      </header>

      <section className="toolbox-grid" aria-label="Traditional drawing toolbox comparisons">
        {paletteStudies.map((study) => <PaletteStudy key={study.id} study={study} />)}
      </section>
    </main>
  )
}

export default App
