import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { applyImageChanges } from '@/components/studio/editor-images';
import {
  collectBlobSrcs,
  countImageSlots,
  getImageAlt,
  isBlobSrc,
  pickImageFiles,
  toSavableContent,
  uploadBlobs as runBlobUploads,
  uploadImageFile,
  type ImageRejection,
  type ImageUploadDeps,
  type UploadedImage,
} from '@/components/studio/image-upload';
import { finalizeImageUpload, requestImageUpload } from '@/lib/actions/images';
import { getImagePublicUrl, IMAGE_UPLOAD_BUCKET } from '@/lib/images/rules';
import { getBrowserSupabase } from '@/lib/supabase/browser';

// 편집기 위에 잠깐 보이는 이미지 안내 (문구는 화면 쪽에서 고름)
export type ImageNotice =
  | ImageRejection
  | 'too_large'
  | 'failed'
  | 'unuploaded';

const NOTICE_DURATION = 6000;

// 편집기에 남길 수 있는 공개 이미지 주소의 앞부분 (사용자 경로 검사는 저장할 때 서버가 함)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLIC_IMAGE_PREFIX = supabaseUrl
  ? getImagePublicUrl(supabaseUrl, '')
  : null;

const uploadDeps: ImageUploadDeps = {
  request: requestImageUpload,
  // 브라우저 클라이언트가 없으면(환경 변수 없음) 올리기 실패로 보고 다음 저장 때 다시 시도
  upload: async (path, token, file) => {
    const supabase = getBrowserSupabase();

    if (!supabase) {
      return false;
    }

    const { error } = await supabase.storage
      .from(IMAGE_UPLOAD_BUCKET)
      .uploadToSignedUrl(path, token, file, { contentType: file.type });

    return !error;
  },
  finalize: finalizeImageUpload,
};

/**
 * 편집기에 넣은 이미지의 대기 목록과 올리기
 * - 넣을 때: 형식·크기·장 수를 검사하고, blob: 주소로 바로 보여 주며 원본은 대기 목록(blob → File)에 둠
 * - 저장할 때: 본문의 blob 이미지를 한 장씩 올리고 편집기 주소를 공개 주소로 바꿈
 *   (실패·장 수 상한이면 blob 으로 두고 안내, 잠시 뒤나 다음 자동 저장 때 다시 시도 / 저장 본문에서는 뺌)
 * - 올리는 중이거나 못 올린 이미지가 남았으면 페이지를 떠나기 전에 확인
 */
export const usePendingImages = (repositoryId: string) => {
  // 아직 올리지 않은 blob 주소 → 원본 파일
  const filesRef = useRef(new Map<string, File>());
  // 올린 blob 주소 → 공개 주소와 크기 (blob 이 남은 예전 본문 스냅숏도 바꿀 수 있도록 계속 둠)
  const uploadedRef = useRef(new Map<string, UploadedImage>());
  const uploadingCountRef = useRef(0);
  // 올리기는 한 번에 한 차례씩 (자동 저장·게시·내보내기가 겹쳐도 같은 이미지를 두 번 올리지 않음)
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  // 마지막으로 이미지를 넣은 편집기 (blob 이미지는 이미지 넣기로만 생김)
  const editorRef = useRef<Editor | null>(null);
  const noticeTimerRef = useRef<number | undefined>(undefined);
  const [notice, setNotice] = useState<ImageNotice | null>(null);

  const showNotice = useCallback((next: ImageNotice) => {
    setNotice(next);
    window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(
      () => setNotice(null),
      NOTICE_DURATION,
    );
  }, []);

  const enqueue = useCallback(<T>(task: () => Promise<T>): Promise<T> => {
    const next = queueRef.current.then(task, task);

    queueRef.current = next.catch(() => undefined);

    return next;
  }, []);

  // 편집기에 둘 수 있는 이미지 주소: 우리 공개 버킷, 또는 이 화면에서 넣은 blob
  const isAllowedSrc = useCallback(
    (src: string) =>
      isBlobSrc(src)
        ? filesRef.current.has(src) || uploadedRef.current.has(src)
        : PUBLIC_IMAGE_PREFIX !== null && src.startsWith(PUBLIC_IMAGE_PREFIX),
    [],
  );

  // 검사를 통과한 파일을 blob 이미지로 넣음 (pos 가 없으면 현재 선택 위치)
  const insertFiles = useCallback(
    (editor: Editor, files: File[], pos?: number) => {
      if (editor.isDestroyed || !editor.isEditable) {
        return;
      }

      const { accepted, rejections } = pickImageFiles(
        files,
        countImageSlots(editor.getJSON()),
      );

      if (rejections.length > 0) {
        showNotice(rejections[0]);
      }

      if (accepted.length === 0) {
        return;
      }

      editorRef.current = editor;

      const nodes = accepted.map((file) => {
        const src = URL.createObjectURL(file);

        filesRef.current.set(src, file);

        return { type: 'image', attrs: { src, alt: getImageAlt(file.name) } };
      });
      const chain = editor.chain().focus();

      if (pos === undefined) {
        chain.insertContent(nodes).run();
      } else {
        chain.insertContentAt(pos, nodes).run();
      }
    },
    [showNotice],
  );

  // blob 이미지를 차례로 올리고 편집기에 반영 (실패한 것은 blob 으로 남겨 다음 차례에 다시 시도)
  const uploadBlobs = useCallback(
    async (
      draftId: string,
      srcs: string[],
      editor: Editor | null,
      emitUpdate: boolean,
    ) => {
      // 순서와 결과별 처리는 uploadBlobs (components/studio/image-upload.ts) 가 정함
      await runBlobUploads(srcs, {
        uploaded: uploadedRef.current,
        files: filesRef.current,
        upload: (file) => {
          uploadingCountRef.current += 1;

          return uploadImageFile(
            uploadDeps,
            repositoryId,
            draftId,
            file,
          ).finally(() => {
            uploadingCountRef.current -= 1;
          });
        },
        apply: (src: string, change: UploadedImage | null) => {
          if (editor) {
            applyImageChanges(editor, new Map([[src, change]]), { emitUpdate });
          }
        },
        notify: showNotice,
        revoke: (src) => URL.revokeObjectURL(src),
      });
    },
    [repositoryId, showNotice],
  );

  /**
   * 자동 저장 직전: 본문 스냅숏의 blob 이미지를 올리고, 올린 것은 공개 주소로 바꾸고 못 올린 것은 뺀 본문
   * - 편집기 반영은 update 이벤트 없이 (이 본문을 바로 저장하므로 다시 저장할 필요 없음)
   */
  const prepareContent = useCallback(
    (
      draftId: string,
      content: JSONContent,
      editor: Editor | null,
    ): Promise<JSONContent> => {
      const srcs = collectBlobSrcs(content);

      if (srcs.length === 0) {
        return Promise.resolve(content);
      }

      return enqueue(async () => {
        await uploadBlobs(draftId, srcs, editor, false);

        return toSavableContent(content, uploadedRef.current);
      });
    },
    [enqueue, uploadBlobs],
  );

  /**
   * 게시·내보내기 직전: 편집기의 blob 이미지를 모두 올림 (blob 이미지가 남지 않으면 true)
   * - emitUpdate: 바뀐 본문을 자동 저장하게 할지 (게시는 게시가 본문을 저장하므로 false)
   */
  const uploadEditorImages = useCallback(
    (
      editor: Editor,
      draftId: string,
      { emitUpdate }: { emitUpdate: boolean },
    ): Promise<boolean> => {
      if (collectBlobSrcs(editor.getJSON()).length === 0) {
        return Promise.resolve(true);
      }

      return enqueue(async () => {
        await uploadBlobs(
          draftId,
          collectBlobSrcs(editor.getJSON()),
          editor,
          emitUpdate,
        );

        return (
          editor.isDestroyed || collectBlobSrcs(editor.getJSON()).length === 0
        );
      });
    },
    [enqueue, uploadBlobs],
  );

  useEffect(() => {
    const files = filesRef.current;

    // 올리는 중이거나 못 올린 이미지가 편집기에 남았으면 새로고침/탭 닫기 전에 확인
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const editor = editorRef.current;

      if (
        uploadingCountRef.current > 0 ||
        (editor &&
          !editor.isDestroyed &&
          collectBlobSrcs(editor.getJSON()).length > 0)
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.clearTimeout(noticeTimerRef.current);
      // 화면을 떠나면 미리 보기용 blob 주소를 놓음 (원본 File 은 남아 마무리 저장이 올릴 수 있음)
      files.forEach((_, src) => URL.revokeObjectURL(src));
    };
  }, []);

  return useMemo(
    () => ({
      notice,
      showNotice,
      isAllowedSrc,
      insertFiles,
      prepareContent,
      uploadEditorImages,
    }),
    [
      notice,
      showNotice,
      isAllowedSrc,
      insertFiles,
      prepareContent,
      uploadEditorImages,
    ],
  );
};
