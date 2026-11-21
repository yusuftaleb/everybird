// @vitest-environment jsdom
// A press on the dock that is not one of its controls closes the open panel (round 6, Yusuf, 2026-11-20), as a press
// outside the dock wrap does; the dock's controls, the chips and the panel stay live (dock-panels.ts pressCloses).
import { describe, expect, it } from 'vitest'
import { pressCloses } from '@/lib/dock-panels'

function dockWrap() {
  document.body.innerHTML = `
    <main id="page"><p id="out">Outside</p>
      <div class="eb-dockwrap" id="wrap">
        <div class="eb-dock" id="dock">
          <div class="eb-dock-tabs" role="group" id="tabs"><button id="tab"><svg id="icon"><path id="glyph" /></svg><span id="tablabel">Tree</span></button></div>
          <div class="eb-dock-filters" id="filters"><button id="taxa">Taxa</button><button id="display">Display</button></div>
          <div class="eb-dock-end"><button id="find">Find</button></div>
        </div>
        <div class="eb-chips" id="chips"><button id="chip">Owls</button></div>
        <div class="eb-drop" role="dialog" id="panel"><p id="panelText">Layout</p></div>
      </div>
    </main>`
  return document.getElementById('wrap')!
}
const at = (id: string) => document.getElementById(id)!

describe('which press closes the open dock panel', () => {
  it('a press outside the dock wrap closes it', () => {
    const wrap = dockWrap()
    expect(pressCloses(at('out'), wrap)).toBe(true)
    expect(pressCloses(at('page'), wrap)).toBe(true)
  })
  it("a press on the dock's empty part closes it: the bar itself, the tabs' group, the panel buttons' group", () => {
    const wrap = dockWrap()
    expect(pressCloses(at('dock'), wrap)).toBe(true)
    expect(pressCloses(at('tabs'), wrap)).toBe(true)
    expect(pressCloses(at('filters'), wrap)).toBe(true)
  })
  it("a press on one of the dock's controls does not (the panel buttons switch or close it themselves), down to a button's icon or label", () => {
    const wrap = dockWrap()
    for (const id of ['tab', 'glyph', 'tablabel', 'taxa', 'display', 'find']) expect(pressCloses(at(id), wrap)).toBe(false)
    expect(pressCloses(at('tablabel').firstChild, wrap)).toBe(false) // a text node
  })
  it('a press on the chips or inside the panel does not', () => {
    const wrap = dockWrap()
    for (const id of ['chips', 'chip', 'panel', 'panelText']) expect(pressCloses(at(id), wrap)).toBe(false)
  })
  it('no wrap (the panel is gone) or no target: closes', () => {
    dockWrap()
    expect(pressCloses(at('out'), null)).toBe(true)
    expect(pressCloses(null, at('wrap'))).toBe(true)
  })
})
