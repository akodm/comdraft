export const cn = (...classes: string[]) => {
  return classes.filter(Boolean).join(' ');
};

// 폼 값으로 받은 GitHub 숫자 id (설치, 저장소), 올바르지 않으면 null
export const parseGithubId = (value: FormDataEntryValue | null) => {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
