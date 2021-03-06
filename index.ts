/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2016, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';

import {
  ISignal, Signal
} from 'phosphor-signaling';

declare var Bokeh:any;

/**
 * A list of instruments to generate data for.
 */
const INSTS = ['MSFT', 'AAPL', 'IBM', 'BHP', 'JPM', 'BAML'];

/**
 * Pick a random element of an array of strings.
 */
function sample(items: string[]): string {
  return items[Math.floor(Math.random() * items.length)];
}


/**
 * The interface required by data providers.
 *
 * For this simple data setup, we assume all data sets
 * are tabular.
 */
interface IDataProvider {
  /**
   * The number of rows in the data set.
   */
  rows(): number;
  /**
   * The number of columns in the data set.
   */
  columns(): number;
  /**
   * The signal emitted when the data is updated.
   */
  dataUpdated: ISignal<IDataProvider, any>;
}


/**
 * The Base class which provides the basic functionality
 * for data providers.
 *
 * This needs to be subclassed to be useful.
 */
class BaseDataProvider implements IDataProvider {
  /**
   * The signal emitted when the data is updated.
   */
  static dataChangedSignal = new Signal<IDataProvider, any>();

  /**
   * Getter for the class static signal.
   *
   * This is what should be used to connect to the signal.
   */
  get dataUpdated(): ISignal<IDataProvider, any> {
    return BaseDataProvider.dataChangedSignal.bind(this);
  }

  /**
   * The number of rows in the data set.
   */
  rows(): number {
    return this._data.length;
  }

  /**
   * The number of columns in the data set.
   *
   * Here we just take the length of the first item,
   * and assume all rows are of the same length.
   */
  columns(): number {
    return this._data[0].length;
  }

  constructor() {
    this.dataUpdated.connect(this._update_target_data_source, this);
  }

  /**
   * Set the target Bokeh datasource. If a plot is given, will search the
   * glyphs until it finds one with a data source and then use that.
   * If null is given, uses the single plot in the page (errors if
   * there are multiple plots).
   */
  set_target(ds: any): void {
     if (ds === null) {
         // Find the one Bokeh plot on the page
         let plot_keys = Object.keys(Bokeh.index);
         if (plot_keys.length == 1) {
             return this.set_target(Bokeh.index[plot_keys[0]]);
         } else {
             throw "set_target(null) only works if there is exactly one Bokeh plot, found " + plot_keys.length;
         }
     } else if (ds.model && ds.model.type == 'Plot') {
         // Find a datasource on the plot, assuming all glyphs in the plot share one data source
         for (var key in ds.renderers) {
            var r = ds.renderers[key];
            if (r && r.mget && r.mget('data_source')) {
                return this.set_target(r.mget('data_source'));
            }
         }
     } else if (ds.stream) {
         // Looks like a datasource
         // Reset current
         if (this._data_source) {
             for (var key in this._data) {
                 if (this._data_source.hasOwnProperty(key)) {
                    this._data_source.get('data')[key] = []
                 }
             }
         }
         // Store
         this._data_source = ds;
         // Reset new
         if (this._data_source) {
             for (var key in this._data) {
                 if (this._data_source.hasOwnProperty(key)) {
                    this._data_source.get('data')[key] = []
                 }
             }
         }
     } else {
         throw "Invalid data source given in set_target(): " + ds;
     }
  }

  private _update_target_data_source(sender: BaseDataProvider, data: any): void {
      if (this._data_source) {
          let data_source_data: any = this._data_source.get('data');
          let data_copy: any = {t: Date.now()};
          for (var key in data) {
             if (data_source_data.hasOwnProperty(key)) {
                 data_copy[key] = data[key];
             }
          }
          this._data_source.stream(data_copy, 100); // todo: how much history?
      }
  }

  protected _data: any = [];
  protected _data_source: any = null;
}


/**
 * The interface required for a simple Trade object.
 */
interface ITrade {
  ident: string;
  trader: string;
  instrument: string;
  quantity: number;
  price: number;
  direction: string;
  book: string;
}


class TradesData extends BaseDataProvider {
  initialise(): void {
    this._initialiseData();
    setInterval(() => this._generateUpdates(), 2000);
  }

  protected _initialiseData(): void {
    this._data = [
      this._generateUpdates()
    ];
  }

  protected _generateUpdates(): any {
    var trade: ITrade = {
      ident: this._newId(),
      trader: sample(this._traders),
      instrument: sample(INSTS),
      quantity: Math.floor(Math.random() * 100),
      price: Math.floor(Math.random() * 10),
      direction: sample(this._directions),
      book: sample(this._books)
    };
    this._data.push(trade);
    this.dataUpdated.emit(trade);
    return trade;
  }

  private _newId(): string {
    var pad = new Array(4).join('0');
    return 'TradeID_' + (pad + this._data.length).slice(-pad.length);
  }

  private _traders: string[] = ['Bob', 'Alice', 'Geoff', 'Gertrude'];
  private _directions: string[] = ['Buy', 'Sell'];
  private _books: string[] = ['A', 'B', 'C', 'D'];
}


class PositionsData extends BaseDataProvider {
  constructor(trades: TradesData) {
    super();
    trades.dataUpdated.connect(this._newTrade, this);
  }

  private _newTrade(sender: TradesData, value: any): void {
    if (this._data[value.instrument] === undefined) {
      this._data[value.instrument] = 0.0;
    }

    if (value.direction === 'Buy') {
      this._data[value.instrument] += value.quantity;
    } else {
      this._data[value.instrument] -= value.quantity;
    }
    this.dataUpdated.emit(this._data);
  }
}


class MarketData extends BaseDataProvider {
  constructor() {
    super();
    setInterval(() => this._generateUpdates(), 4000);
  }

  private _generateUpdates(): any {
    var item = sample(INSTS);
    var value = (Math.random() * 10) - 5;

    if (this._data[item] === undefined) {
      this._data[item] = 0.0;
    }
    this._data[item] += value;
    this.dataUpdated.emit(this._data);
  }

}


class PnlData extends BaseDataProvider {
  constructor(positions: PositionsData, market: MarketData) {
    super();
    positions.dataUpdated.connect(this._positionsUpdate, this);
    market.dataUpdated.connect(this._marketDataUpdate, this);
  }

  private _positionsUpdate(sender: PositionsData, value: any) {
    this._pos = value;
    this._recalculate();
  }

  private _marketDataUpdate(sender: MarketData, value: any) {
    this._mkt = value;
    this._recalculate();
  }

  private _recalculate(): void {

    this._pnl = [];
    for (var inst in this._pos) {
      if (this._pos.hasOwnProperty(inst)) {
        let mkt = this._mkt[inst];
        if (mkt !== undefined) {
          this._pnl.push( [inst, this._pos[inst] * this._mkt[inst]] );
        }
      }
    }
    console.log('Emitting PNL', this._pnl);
    this.dataUpdated.emit(this._pnl);
  }

  private _pos: any = [];
  private _mkt: any = [];
  private _pnl: any = [];
}


function main() {
  var tradesFeed = new TradesData();
  var posFeed = new PositionsData(tradesFeed);
  var marketDataFeed = new MarketData();
  var pnlFeed = new PnlData(posFeed, marketDataFeed);

  tradesFeed.initialise();
  posFeed.set_target(null);
}

window.onload = main;
