import type { Order } from '../types';
import { BakeryOperationsError, fetchCustomerOrderStatus } from './sheetStaffApi';
import type { StatusSnapshot } from './sheetStaffApi';

/**
 * A saved receipt is only a device-side copy. A real missing Sheet row
 * removes the local copy, but timeouts, permission errors and a changed
 * phone number NEVER cause destructive local cleanup.
 */
export function isConfirmedDeletedSheetOrder(error:unknown): boolean {
  return error instanceof BakeryOperationsError &&
    error.code === 'not_found' &&
    error.message === 'Order reference not found.';
}
export interface ReceiptSyncResult {
  current: Order[];
  deletedIds: string[];
  failedIds: string[];
}
export async function verifyStoredOrderHistory(
  endpoint: string,
  receipts: readonly Order[],
  googleToken?: string,
  phoneToken?: string,
  verifier: typeof fetchCustomerOrderStatus = fetchCustomerOrderStatus,
): Promise<ReceiptSyncResult> {
  const verified: (Order | null)[] = new Array(receipts.length).fill(null);
  const deletedIds:string[] = [],failedIds:string[]=[];
  let cursor = 0;
  // Never fire dozens of simultaneous Apps Script calls. Verify the whole
  // stored list gradually, using at most three network requests at a time.
  const worker = async () => {
    while (cursor < receipts.length) {
      const i = cursor++;
      const receipt = receipts[i];
      if (receipt.persistence !== 'google_sheets') {
        verified[i] = receipt;
        continue;
      }
      try {
        const live:StatusSnapshot = await verifier(endpoint,receipt,googleToken,phoneToken);
        verified[i] = {
          ...receipt,
          status:live.status,
          history:live.history,
          updated_at:live.updated_at,
          rider_name:live.rider_name,
          payment_status:live.payment_status,
          cod_collected:live.cod_collected,
          delivery_otp:live.delivery_otp || '',
        };
      } catch (error) {
        if (isConfirmedDeletedSheetOrder(error)) deletedIds.push(receipt.id);
        else { verified[i] = receipt; failedIds.push(receipt.id); }
      }
    }
  };
  await Promise.all(Array.from({length:Math.min(3,receipts.length)},()=>worker()));
  return {current:verified.filter((item): item is Order => item!==null),deletedIds,failedIds};
}
