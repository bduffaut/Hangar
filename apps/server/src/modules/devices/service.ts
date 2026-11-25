import { isSerialDevicePath, serialDeviceName } from '@hangar/shared'
import type { Ctx } from '../../context.ts'
import { UserError } from '../../errors.ts'
import { listSerialDevices } from '../../platform/host.ts'
import { deviceUsage } from './repo.ts'

// USB sticks (D55): an admin passes one to an app by its stable /dev/serial/by-id path, checked
// against what is plugged in when it is picked and again at every start.

export class DeviceError extends UserError {
  constructor(message: string, hint?: string) {
    super(400, 'invalid_device', message, hint)
  }
}

/** Every USB serial device plugged in, with the apps that use it (Settings and install). */
export async function deviceList(ctx: Ctx) {
  const [devices, usage] = await Promise.all([listSerialDevices(ctx), deviceUsage(ctx.db)])
  return devices
    .filter((d) => isSerialDevicePath(d.path))
    .map((d) => ({ ...d, name: serialDeviceName(d.path), usedBy: usage.get(d.path) ?? [] }))
}

/** Refuses a device path that is not a plugged-in USB serial device. */
export async function checkDevice(ctx: Ctx, path: string): Promise<void> {
  if (!isSerialDevicePath(path)) {
    throw new DeviceError(
      'Pick a USB device from the list.',
      'Only devices under /dev/serial/by-id can be passed to apps.',
    )
  }
  const plugged = await listSerialDevices(ctx)
  if (!plugged.some((d) => d.path === path)) {
    throw new DeviceError(
      `${serialDeviceName(path)} is not plugged in.`,
      'Plug the stick into the computer, then try again.',
    )
  }
}
