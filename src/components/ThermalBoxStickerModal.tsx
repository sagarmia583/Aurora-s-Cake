import React from 'react';
import type { Order } from '../types';
import { PosPrintModal } from './PosPrintModal';

interface ThermalBoxStickerModalProps {
  order: Order | null;
  onClose: () => void;
  currency: string;
}

export const ThermalBoxStickerModal: React.FC<ThermalBoxStickerModalProps> = ({
  order,
  onClose,
  currency,
}) => {
  return (
    <PosPrintModal
      order={order}
      onClose={onClose}
      currency={currency}
      initialType="box_sticker"
    />
  );
};
