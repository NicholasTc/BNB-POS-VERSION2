export type SessionFarewell = {
  id: string;
  names: string[];
  productsSold: number;
  ordersSold: number;
  pendingOrders: number;
};
export type PreparationOrder = {
  id: string;
  reference: string;
  cashierName: string;
  receivedAt: string;
  finishedAt: string | null;
  finishedByName: string | null;
  carriedOver: boolean;
  lines: { name: string; quantity: number }[];
};
export type OrderPage = {
  orders: PreparationOrder[];
  nextCursor: string | null;
  total: number;
};
export type OrderBoardState = {
  session: { id: string; openedAt: string };
  pending: OrderPage;
  finished: OrderPage;
};
