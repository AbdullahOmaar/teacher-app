import { ar } from './ar'

/** صيغ الجمع الست لفئات CLDR العربية (zero/one/two/few/many/other) */
export interface PluralForms {
  zero?: string
  one?: string
  two?: string
  few?: string
  many?: string
  other: string
}

/** قيمة رسالة: نص مباشر أو صيغ جمع تُختار بـ Intl.PluralRules */
export type Msg = string | PluralForms

export type Dict = typeof ar

/** كل مسارات المفاتيح المنقّطة في القاموس (مشتقة من بنيته فعلياً) */
export type I18nKey = DotPaths<Dict>

type DotPaths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends Msg
    ? `${Prefix}${K}`
    : T[K] extends Record<string, unknown>
      ? DotPaths<T[K], `${Prefix}${K}.`>
      : never
}[keyof T & string]

/** وسائط الاستيفاء: {name} في النص تُستبدل من هنا — count للجمع */
export type Params = Record<string, string | number>
