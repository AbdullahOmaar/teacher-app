import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Phone, Pencil, UserRound } from 'lucide-react'
import { ActionTile, ActionTiles } from './ActionTiles'

afterEach(() => {
  cleanup()
})

describe('ActionTiles — شبكة الإجراءات الموحّدة (نقطة ٢)', () => {
  it('الخلايا متساوية: نفس الارتفاع الثابت لكل خلية', () => {
    const { container } = render(
      <ActionTiles>
        <ActionTile icon={Phone} label="اتصال" href="tel:0100" />
        <ActionTile icon={Pencil} label="تعديل" onClick={() => {}} variant="ghost" />
      </ActionTiles>,
    )
    const cells = [...container.querySelectorAll('a, button')]
    expect(cells.length).toBe(2)
    for (const c of cells) {
      expect(c.className).toContain('h-[68px]')
      expect(c.className).toContain('flex-col')
    }
    expect(container.firstElementChild!.className).toContain('grid-cols-3')
  })

  it('رابط الهاتف يبقى رابطاً بنفس href، والزر يستدعي onClick', () => {
    const onClick = vi.fn()
    render(
      <ActionTiles>
        <ActionTile icon={Phone} label="اتصال" href="tel:0100" />
        <ActionTile icon={Pencil} label="تعديل" onClick={onClick} />
      </ActionTiles>,
    )
    expect(screen.getByText('اتصال').closest('a')!.getAttribute('href')).toBe('tel:0100')
    screen.getByText('تعديل').closest('button')!.click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('to يرسم رابط react-router داخلي بنفس الخلية', () => {
    render(
      <MemoryRouter>
        <ActionTiles>
          <ActionTile icon={UserRound} label="ملف الطالب" to="/students/abc" variant="ok" />
        </ActionTiles>
      </MemoryRouter>,
    )
    const a = screen.getByText('ملف الطالب').closest('a')!
    expect(a.getAttribute('href')).toBe('/students/abc')
    expect(a.className).toContain('h-[68px]')
    expect(a.className).toContain('bg-ok/10')
  })

  it('المعطّل يبقى معطّلاً', () => {
    render(
      <ActionTiles>
        <ActionTile icon={Pencil} label="تعديل" onClick={() => {}} disabled />
      </ActionTiles>,
    )
    expect(screen.getByText('تعديل').closest('button')).toBeDisabled()
  })
})
