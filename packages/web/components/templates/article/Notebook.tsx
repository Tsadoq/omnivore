import { Box, HStack, VStack, SpanBox } from '../../elements/LayoutPrimitives'
import { StyledText } from '../../elements/StyledText'
import { theme } from '../../tokens/stitches.config'
import type { Highlight } from '../../../lib/networking/fragments/highlightFragment'
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import {
  BookOpen,
  CaretDown,
  CaretRight,
  DotsThree,
  Pencil,
  PencilLine,
  X,
} from 'phosphor-react'
import { updateHighlightMutation } from '../../../lib/networking/mutations/updateHighlightMutation'
import { showErrorToast, showSuccessToast } from '../../../lib/toastHelpers'
import { diff_match_patch } from 'diff-match-patch'
import 'react-markdown-editor-lite/lib/index.css'
import { createHighlightMutation } from '../../../lib/networking/mutations/createHighlightMutation'
import { v4 as uuidv4 } from 'uuid'
import { nanoid } from 'nanoid'
import { deleteHighlightMutation } from '../../../lib/networking/mutations/deleteHighlightMutation'
import { HighlightViewItem } from './HighlightViewItem'
import { ConfirmationModal } from '../../patterns/ConfirmationModal'
import { TrashIcon } from '../../elements/images/TrashIcon'
import { UserBasicData } from '../../../lib/networking/queries/useGetViewerQuery'
import { ReadableItem } from '../../../lib/networking/queries/useGetLibraryItemsQuery'
import { SetHighlightLabelsModalPresenter } from './SetLabelsModalPresenter'
import { Button } from '../../elements/Button'
import { ArticleNotes } from '../../patterns/ArticleNotes'
import { useGetArticleQuery } from '../../../lib/networking/queries/useGetArticleQuery'

type NotebookContentProps = {
  viewer: UserBasicData

  item: ReadableItem
  highlights: Highlight[]

  viewInReader: (highlightId: string) => void

  onAnnotationsChanged?: (highlights: Highlight[]) => void

  showConfirmDeleteNote?: boolean
  setShowConfirmDeleteNote?: (show: boolean) => void
}

export const getHighlightLocation = (patch: string): number | undefined => {
  const dmp = new diff_match_patch()
  const patches = dmp.patch_fromText(patch)
  return patches[0].start1 || undefined
}

type NoteState = {
  isCreating: boolean
  note: Highlight | undefined
  createStarted: Date | undefined
}

export function NotebookContent(props: NotebookContentProps): JSX.Element {
  const { articleData, mutate } = useGetArticleQuery({
    slug: props.item.slug,
    username: props.viewer.profile.username,
    includeFriendsHighlights: false,
  })
  const [showConfirmDeleteHighlightId, setShowConfirmDeleteHighlightId] =
    useState<undefined | string>(undefined)
  const [labelsTarget, setLabelsTarget] = useState<Highlight | undefined>(
    undefined
  )
  const [notesEditMode, setNotesEditMode] = useState<'edit' | 'preview'>(
    'preview'
  )
  const noteState = useRef<NoteState>({
    isCreating: false,
    note: undefined,
    createStarted: undefined,
  })

  const newNoteId = useMemo(() => {
    return uuidv4()
  }, [])

  const updateNote = useCallback((note: Highlight, text: string) => {
    ;(async () => {
      const result = await updateHighlightMutation({
        highlightId: note.id,
        annotation: text,
      })
    })()
  }, [])

  const createNote = useCallback((text: string) => {
    console.log('creating note: ', newNoteId, noteState.current.isCreating)
    noteState.current.isCreating = true
    noteState.current.createStarted = new Date()
    ;(async () => {
      try {
        const success = await createHighlightMutation({
          id: newNoteId,
          shortId: nanoid(8),
          type: 'NOTE',
          articleId: props.item.id,
          annotation: text,
        })
        if (success) {
          noteState.current.note = success
          noteState.current.isCreating = false
        }
      } catch (error) {
        console.error('error creating note: ', error)
        noteState.current.isCreating = false
      }
    })()
  }, [])

  const highlights = useMemo(() => {
    const result = articleData?.article.article.highlights
    const note = result?.find((h) => h.type === 'NOTE')
    if (note) {
      noteState.current.note = note
      noteState.current.isCreating = false
    }
    return result
  }, [articleData])

  useEffect(() => {
    if (highlights && props.onAnnotationsChanged) {
      props.onAnnotationsChanged(highlights)
    }
  }, [highlights])

  const sortedHighlights = useMemo(() => {
    const sorted = (a: number, b: number) => {
      if (a < b) {
        return -1
      }
      if (a > b) {
        return 1
      }
      return 0
    }

    return (highlights ?? [])
      .filter((h) => h.type === 'HIGHLIGHT')
      .sort((a: Highlight, b: Highlight) => {
        if (a.highlightPositionPercent && b.highlightPositionPercent) {
          return sorted(a.highlightPositionPercent, b.highlightPositionPercent)
        }
        // We do this in a try/catch because it might be an invalid diff
        // With PDF it will definitely be an invalid diff.
        try {
          const aPos = getHighlightLocation(a.patch)
          const bPos = getHighlightLocation(b.patch)
          if (aPos && bPos) {
            return sorted(aPos, bPos)
          }
        } catch {}
        return a.createdAt.localeCompare(b.createdAt)
      })
  }, [highlights])

  const handleSaveNoteText = useCallback(
    (text, cb: (success: boolean) => void) => {
      console.log('handleSaveNoteText', noteState.current)
      if (noteState.current.note) {
        updateNote(noteState.current.note, text)
        return
      }
      if (noteState.current.isCreating) {
        console.log('note is being created, deferring')

        if (noteState.current.createStarted) {
          const timeSinceStart =
            new Date().getTime() - noteState.current.createStarted.getTime()
          console.log(' -- timeSinceStart: ', timeSinceStart)

          if (timeSinceStart > 4000) {
            createNote(text)
            return
          }
        }
        return
      }
      createNote(text)
    },
    [noteState, createNote, updateNote]
  )

  const [articleNotesCollapsed, setArticleNotesCollapsed] = useState(false)
  const [highlightsCollapsed, setHighlightsCollapsed] = useState(false)

  return (
    <VStack
      distribution="start"
      css={{
        height: '100%',
        width: '100%',
        p: '20px',
        '@mdDown': { p: '15px' },
      }}
    >
      <SectionTitle
        title="Article Notes"
        collapsed={articleNotesCollapsed}
        setCollapsed={setArticleNotesCollapsed}
      />
      {!articleNotesCollapsed && (
        <HStack
          alignment="start"
          distribution="start"
          css={{ width: '100%', mt: '10px', gap: '10px' }}
        >
          <ArticleNotes
            mode={notesEditMode}
            targetId={props.item.id}
            setEditMode={setNotesEditMode}
            text={noteState.current.note?.annotation}
            placeHolder="Add notes to this document..."
            saveText={handleSaveNoteText}
          />
        </HStack>
      )}

      <SpanBox css={{ mt: '10px', mb: '25px' }} />
      <Box css={{ width: '100%' }}>
        <SectionTitle
          title="Highlights"
          collapsed={highlightsCollapsed}
          setCollapsed={setHighlightsCollapsed}
        />

        {!highlightsCollapsed && (
          <>
            {sortedHighlights.map((highlight) => (
              <HighlightViewItem
                key={highlight.id}
                item={props.item}
                viewer={props.viewer}
                highlight={highlight}
                viewInReader={props.viewInReader}
                setSetLabelsTarget={setLabelsTarget}
                setShowConfirmDeleteHighlightId={
                  setShowConfirmDeleteHighlightId
                }
                updateHighlight={() => {
                  // dispatchAnnotations({
                  //   type: 'UPDATE_HIGHLIGHT',
                  //   updateHighlight: highlight,
                  // })
                }}
              />
            ))}
            {sortedHighlights.length === 0 && (
              <Box
                css={{
                  mt: '15px',
                  width: '100%',
                  fontSize: '9px',
                  color: '$thTextSubtle',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: '100px',
                }}
              >
                You have not added any highlights to this document.
              </Box>
            )}
          </>
        )}
        {/* <Box
          css={{
            '@mdDown': {
              height: '320px',
              width: '100%',
              background: 'transparent',
            },
          }}
        /> */}
      </Box>

      {showConfirmDeleteHighlightId && (
        <ConfirmationModal
          message={'Are you sure you want to delete this highlight?'}
          onAccept={() => {
            ;(async () => {
              const success = await deleteHighlightMutation(
                showConfirmDeleteHighlightId
              )
              mutate()
              if (success) {
                showSuccessToast('Highlight deleted.')
              } else {
                showErrorToast('Error deleting highlight')
              }
            })()
            setShowConfirmDeleteHighlightId(undefined)
          }}
          onOpenChange={() => setShowConfirmDeleteHighlightId(undefined)}
          icon={
            <TrashIcon
              size={40}
              strokeColor={theme.colors.grayTextContrast.toString()}
            />
          }
        />
      )}
      {labelsTarget && (
        <SetHighlightLabelsModalPresenter
          highlight={labelsTarget}
          highlightId={labelsTarget.id}
          onOpenChange={() => setLabelsTarget(undefined)}
        />
      )}
      {props.showConfirmDeleteNote && (
        <ConfirmationModal
          message="Are you sure you want to delete the note from this document?"
          acceptButtonLabel="Delete"
          onAccept={() => {
            // deleteDocumentNote()
            if (props.setShowConfirmDeleteNote) {
              props.setShowConfirmDeleteNote(false)
            }
          }}
          onOpenChange={() => {
            if (props.setShowConfirmDeleteNote) {
              props.setShowConfirmDeleteNote(false)
            }
          }}
        />
      )}
    </VStack>
  )
}

type SectionTitleProps = {
  title: string
  collapsed: boolean
  setCollapsed: (set: boolean) => void
}

function SectionTitle(props: SectionTitleProps): JSX.Element {
  return (
    <>
      <Button
        style="plainIcon"
        css={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          gap: '5px',
        }}
        onClick={(event) => {
          props.setCollapsed(!props.collapsed)
          event.stopPropagation()
        }}
      >
        {props.collapsed ? (
          <CaretRight
            size={12}
            color={theme.colors.thNotebookSubtle.toString()}
          />
        ) : (
          <CaretDown
            size={12}
            color={theme.colors.thNotebookSubtle.toString()}
          />
        )}
        <StyledText
          css={{
            m: '0px',
            pt: '2px',
            fontFamily: '$inter',
            fontWeight: '500',
            fontSize: '12px',
            color: '$thNotebookSubtle',
          }}
        >
          {props.title}
        </StyledText>
      </Button>
    </>
  )
}
