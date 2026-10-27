import { useConfirm } from 'primevue/useconfirm'

/** Asks before doing something; resolves true when the person confirms. */
export function useConfirmAction() {
  const confirm = useConfirm()
  return (options: { title: string; body: string; action: string; danger?: boolean }) =>
    new Promise<boolean>((resolve) => {
      confirm.require({
        header: options.title,
        message: options.body,
        acceptProps: { label: options.action, severity: options.danger ? 'danger' : undefined },
        rejectProps: { label: 'Cancel', severity: 'secondary', variant: 'text' },
        accept: () => resolve(true),
        reject: () => resolve(false),
        onHide: () => resolve(false),
      })
    })
}
