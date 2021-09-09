const vscode = require('vscode');
const path = require('path');
class TreeDataProvider {
  constructor(events) {
    let data = []
    const dateIcons = {
      light: path.join(__filename, '..', '..', '..', 'images', 'light', 'calendar.svg'),
      dark: path.join(__filename, '..', '..', '..', 'images', 'dark', 'calendar.svg')
    }

    const eventIcons = {
      light: path.join(__filename, '..', '..', '..', 'images', 'light', 'check.svg'),
      dark: path.join(__filename, '..', '..', '..', 'images', 'dark', 'check.svg')
    }
    for (let date in events) {
      let dateEvents = []

      events[date].forEach(event => {
        const from = new Date(event.start.dateTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const to = new Date(event.end.dateTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        dateEvents.push(new TreeItem(`${event.summary} ${from}-${to}`, undefined, eventIcons, event))
      })
      data.push(new TreeItem(date, [
        ...dateEvents,
      ], dateIcons))
    }

    this.data = data
    //  [new TreeItem('cars', [
    //   new TreeItem(
    //     'Ford', [new TreeItem('Fiesta'), new TreeItem('Focus'), new TreeItem('Mustang')]),
    //   new TreeItem(
    //     'BMW', [new TreeItem('320'), new TreeItem('X3'), new TreeItem('X5')])
    // ])];
  }

  getTreeItem(element) {
    return {
      ...element,
      contextValue: element.children ? 'date' : 'event'  
    };
  }

  getChildren(element = undefined) {
    if (element === undefined) {
      return this.data;
    }
    return element.children;
  }



}
class TreeItem extends vscode.TreeItem {
  constructor(label, children,
    iconPath, event) {
    super(
      label,
      children === undefined ? vscode.TreeItemCollapsibleState.None :
        vscode.TreeItemCollapsibleState.Expanded)
    this.iconPath = iconPath
    this.event = event
    this.children = children;

    // this.children = children;
  }
}

module.exports = { TreeDataProvider };