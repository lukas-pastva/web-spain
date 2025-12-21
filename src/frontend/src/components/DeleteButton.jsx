export function DeleteButton({
  onClick,
  isConfirming,
  disabled,
  className = '',
  title = 'Delete',
  confirmIcon = '✓',
  deleteIcon = '🗑️'
}) {
  return (
    <button
      className={`${className} ${isConfirming ? 'confirming' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {isConfirming ? confirmIcon : deleteIcon}
    </button>
  );
}

export function ConfirmButton({
  onClick,
  isConfirming,
  disabled,
  className = 'btn btn-danger',
  children,
  confirmText = 'Click again to confirm',
  loadingText = 'Deleting...'
}) {
  const getButtonText = () => {
    if (isConfirming) return confirmText;
    if (disabled) return loadingText;
    return children;
  };

  return (
    <button
      className={`${className} ${isConfirming ? 'confirming' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {getButtonText()}
    </button>
  );
}
