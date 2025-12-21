import { useState } from 'react';

export function useConfirmDelete(timeout = 3000) {
  const [confirmDelete, setConfirmDelete] = useState(null);

  const requestConfirm = (id) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), timeout);
      return false;
    }
    setConfirmDelete(null);
    return true;
  };

  const isConfirming = (id) => confirmDelete === id;

  const resetConfirm = () => setConfirmDelete(null);

  return {
    requestConfirm,
    isConfirming,
    resetConfirm
  };
}
