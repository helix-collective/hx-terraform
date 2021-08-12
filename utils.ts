
export function mapObject<Obj,T>(obj: Obj, func: (v:Obj[keyof Obj])=>T) : Record<keyof Obj, T> {
  const result = {} as Record<keyof Obj, T>;
    for(const k of Object.keys(obj)) {
    result[k as keyof Obj] = func(obj[k as keyof Obj]);
  }
  return result;
}

export function assertNever(msg: string, t: never) : never {
  throw new Error(msg + `${t}`);
}
