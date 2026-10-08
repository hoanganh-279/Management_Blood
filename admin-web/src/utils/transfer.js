// Which single lifecycle action the current user can take on a transfer (UI gating only —
// the backend enforces the same rules in services/transfers.py).

export function transferRoles(t, user) {
  const isAdmin = user?.role === 'admin'
  return {
    isSource: isAdmin || (!!user?.center_id && user.center_id === t.source_center_id),
    isDest: isAdmin || (!!user?.center_id && user.center_id === t.dest_center_id),
  }
}

export const NEXT_ACTION_LABEL = {
  confirm: 'Xác nhận nguồn',
  export: 'Xuất kho',
  transit: 'Bàn giao vận chuyển',
  arrive: 'Xác nhận đã nhận hàng',
  receive: 'Đối chiếu nhập kho',
}

export function nextAction(t, user) {
  const { isSource, isDest } = transferRoles(t, user)
  switch (t.status) {
    case 'proposed':
      return isSource ? 'confirm' : null
    case 'source_confirmed':
      return isSource ? 'export' : null
    case 'exported':
      return isSource ? 'transit' : null
    case 'in_transit':
      return isDest ? 'arrive' : null
    case 'inbound_pending':
      return isDest ? 'receive' : null
    default:
      return null
  }
}

export function waitingFor(t) {
  switch (t.status) {
    case 'proposed':
      return 'Chờ cơ sở nguồn xác nhận'
    case 'source_confirmed':
      return 'Chờ cơ sở nguồn xuất kho'
    case 'exported':
      return 'Chờ cơ sở nguồn bàn giao vận chuyển (checklist Điều 20)'
    case 'in_transit':
      return 'Đang vận chuyển — chờ cơ sở đích xác nhận đã nhận hàng'
    case 'inbound_pending':
      return 'Chờ cơ sở đích đối chiếu nhập (checklist Điều 40)'
    default:
      return null
  }
}

export const OPEN_TRANSFER_STATUSES = ['proposed', 'source_confirmed', 'exported', 'in_transit', 'inbound_pending']
