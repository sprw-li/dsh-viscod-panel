/**
 * Viscod DSH 面板 · 客户端半侧（右侧 Sidebar 版）
 *
 * 注册一个右侧 Sidebar 的 tab 类型（kind: viscod）：
 *  - 「开始」引导页会多出一个「思维导图」入口（点击即以 tab 打开）
 *  - tab 内容 = 一个 iframe，直接加载 Viscod Web UI（带 embed=1 精简布局）
 *  - 顶部细工具条：状态点 / 项目路径 / 重新扫描 / 重载 / 新窗口
 */
window.__ModuleLoader__.load({
  id: '@local/viscod-panel',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const zh = /^zh/i.test((typeof navigator !== 'undefined' && navigator.language) || '')
    const TEXT = {
      label: zh ? '思维导图' : 'Mind map',
      description: zh ? 'Viscod · 项目文件夹思维导图' : 'Viscod project mind map',
      starting: zh ? '正在启动 Viscod…' : 'Starting Viscod…',
      error: zh ? '启动失败' : 'Failed',
      retry: zh ? '重试' : 'Retry',
      reload: zh ? '重载' : 'Reload',
      rescan: zh ? '重新扫描' : 'Rescan',
      external: zh ? '新窗口' : 'New window',
      files: zh ? '个文件' : 'files',
      hint: zh ? 'Viscod 服务未运行时由面板自动拉起' : 'Starts the Viscod server on demand',
    }

    const TAB_ID = '@local/viscod-panel'
    const TAB_KIND = 'viscod'

    const mono = "'JetBrains Mono','Cascadia Code',Consolas,monospace"
    const INK = '#e7eaf0'
    const DIM = '#8b95a5'
    const BG = '#0e1014'
    const BAR_BG = '#12151b'
    const LINE = '#262d3a'

    function ViscodIcon(props) {
      const size = (props && props.size) || 18
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        h('circle', { cx: 4.5, cy: 12, r: 2.2 }),
        h('circle', { cx: 19.5, cy: 5.5, r: 2.2 }),
        h('circle', { cx: 19.5, cy: 18.5, r: 2.2 }),
        h('path', { d: 'M6.5 11 17.4 6.4' }),
        h('path', { d: 'M6.5 13 17.4 17.6' }),
      )
    }

    const smallBtn = {
      padding: '2px 8px',
      borderRadius: 5,
      border: '1px solid rgba(124,156,255,0.35)',
      background: 'rgba(124,156,255,0.12)',
      color: '#c3d0ff',
      cursor: 'pointer',
      fontSize: 11,
      lineHeight: 1.5,
      flex: 'none',
    }
    const dimText = { color: DIM, fontSize: 11 }

    /** 面板兜底：组件渲染出错时给提示，而不是让整个面板白屏/崩掉 */
    class PanelBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error) {
        console.warn('[viscod-panel] render failed', error)
      }

      render() {
        if (this.state.error) {
          return h(
            'div',
            { style: { padding: 16, color: '#f87171', fontSize: 12, lineHeight: 1.7 } },
            'Viscod 面板渲染出错：',
            String((this.state.error && this.state.error.message) || this.state.error),
            h('br'),
            h(
              'button',
              {
                type: 'button',
                style: { ...smallBtn, marginTop: 10 },
                onClick: () => this.setState({ error: null }),
              },
              '重试',
            ),
          )
        }
        return this.props.children
      }
    }

    /** 右侧栏 tab 正文：一整块 iframe */
    function ViscodBody() {
      const [phase, setPhase] = React.useState('starting')
      const [status, setStatus] = React.useState(null)
      const [error, setError] = React.useState('')
      const [nonce, setNonce] = React.useState(0)

      const load = React.useCallback(async () => {
        setPhase('starting')
        setError('')
        try {
          const res = await fetch('/viscod/ensure', { method: 'POST' })
          const data = await res.json()
          if (!res.ok || !data.ok) throw new Error(data.error || 'ensure failed')
          const s = await (await fetch('/viscod/status')).json()
          if (!s.ok) throw new Error(TEXT.error)
          setStatus(s)
          setPhase('ready')
        } catch (err) {
          setError(String((err && err.message) || err))
          setPhase('error')
        }
      }, [])

      React.useEffect(() => {
        void load()
      }, [load])

      const rescan = async () => {
        try {
          await fetch('/viscod/rescan', { method: 'POST' })
        } catch {
          /* ignore */
        }
        setNonce((v) => v + 1)
      }

      const bar = h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 8px',
            borderBottom: `1px solid ${LINE}`,
            background: BAR_BG,
            flex: 'none',
            minHeight: 32,
            overflow: 'hidden',
          },
        },
        h('span', {
          style: {
            width: 7,
            height: 7,
            borderRadius: '50%',
            flex: 'none',
            background: phase === 'ready' ? '#34d399' : '#3a4763',
          },
        }),
        h(
          'span',
          {
            style: {
              ...dimText,
              fontFamily: mono,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              flex: 1,
            },
            title: (status && status.root) || '',
          },
          phase === 'ready' ? status.root || '' : phase === 'error' ? `${TEXT.error}：${error}` : TEXT.starting,
        ),
        h('span', { style: { ...dimText, flex: 'none' } }, phase === 'ready' ? `${status.files} ${TEXT.files}` : ''),
        h('button', { type: 'button', style: smallBtn, onClick: rescan, title: TEXT.rescan }, TEXT.rescan),
        h('button', { type: 'button', style: smallBtn, onClick: () => setNonce((v) => v + 1), title: TEXT.reload }, TEXT.reload),
        phase === 'ready'
          ? h(
              'button',
              { type: 'button', style: smallBtn, onClick: () => window.open(status.url, '_blank', 'noopener'), title: TEXT.external },
              TEXT.external,
            )
          : null,
      )

      let content
      if (phase === 'ready' && status && status.ok) {
        content = h('iframe', {
          key: `viscod-frame-${nonce}`,
          src: `${status.url}?embed=1&v=${nonce}`,
          title: 'Viscod',
          allow: 'clipboard-read; clipboard-write; fullscreen',
          style: { flex: 1, width: '100%', border: 0, minHeight: 0, background: BG },
        })
      } else if (phase === 'error') {
        content = h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: 8, padding: 16, alignItems: 'flex-start' } },
          h('div', { style: { color: '#f87171', fontSize: 12 } }, `${TEXT.error}：${error}`),
          h('div', { style: dimText }, TEXT.hint),
          h('button', { type: 'button', style: smallBtn, onClick: () => void load() }, TEXT.retry),
        )
      } else {
        content = h('div', { style: { ...dimText, padding: 16 } }, TEXT.starting)
      }

      return h(
        PanelBoundary,
        null,
        h(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              minHeight: 0,
              background: BG,
              color: INK,
            },
          },
          bar,
          content,
        ),
      )
    }

    function ViscodTitle() {
      return h('span', null, TEXT.label)
    }

    return {
      inject: ['slots', 'sidebarRight', 'sidebarRightTabs'],
      apply(ctx) {
        try {
          void fetch('/viscod/client-loaded', { method: 'POST' }).catch(() => {})
        } catch {
          /* ignore */
        }

        // 1) 声明 tab 类型 + 开始页引导入口
        ctx.effect(() =>
          ctx.sidebarRightTabs.register({
            id: TAB_ID,
            kind: TAB_KIND,
            multiple: true,
            priority: 'extension',
            title: () => TEXT.label,
            guide: [
              {
                id: 'open',
                order: 31,
                title: () => TEXT.label,
                description: () => TEXT.description,
                icon: ViscodIcon,
              },
            ],
            keepMounted: true,
          }),
        )

        // 2) tab 正文
        ctx.effect(() =>
          ctx.slots.inject('sidebar.right.pane.tab', () =>
            ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, ViscodBody),
          ),
        )

        // 3) tab 标题
        ctx.effect(() =>
          ctx.slots.inject('sidebar.right.pane.tab.title', () =>
            ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID }, ViscodTitle),
          ),
        )
      },
    }
  },
})
