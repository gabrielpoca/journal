import React, { Component } from "react";
import { withRouter } from "react-router";
import { createGlobalStyle } from "styled-components";
import CssBaseline from "@material-ui/core/CssBaseline";
import { Route, Switch, Redirect } from "react-router-dom";

import EntriesRouter from "./entries/Router";
import SettingsRouter from "./settings/Router";
import AccountRouter from "./account";
import { UserContextProvider } from "./account/UserContext";
import KeyValueStorage from "./KeyValueStorage";

const GlobalStyle = createGlobalStyle`
  html,
  body,
  #root {
    -webkit-font-smoothing: antialised;
    font-family: 'Roboto', sans-serif;
    font-family: 16px;
    height: 100%;
    line-height: 1.25em;
    margin: 0;
    padding: 0;
  }

  *, *:before, *:after {
    box-sizing: border-box;
  }

  :root {
    --max-width: 640px;
    --nav-height: 56px;
  }
`;

class App extends Component {
  render() {
    return (
      <UserContextProvider>
        <KeyValueStorage>
          <GlobalStyle />
          <CssBaseline />
          <Switch>
            <Route path="/entries" component={EntriesRouter} />
            <Route path="/settings" component={SettingsRouter} />
            <Route path="/account" component={AccountRouter} />
            <Route render={() => <Redirect to="/entries" />} />
          </Switch>
        </KeyValueStorage>
      </UserContextProvider>
    );
  }
}

export default withRouter(App);
