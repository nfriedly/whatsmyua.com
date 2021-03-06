import React from 'react';
import uuidV4 from 'uuid/v4';
import Link from 'next/link';
import TimeAgo from 'react-timeago';
import Layout from '../src/components/Layout.js';
import { BannerAd } from '../src/components/Ads';
import UA from '../src/components/UA';
import { trackEvent, trackException } from '../src/analytics';

class Host extends React.Component {
  constructor(props, context) {
    super(props, context);

    this.retry_delay = 10;
    this.state = {
      ua: null
    };
  }

  openSocket() {
    const guid = this.props.guid;
    const socket = (this.socket = new WebSocket(`${location.protocol.replace('http', 'ws')}//${location.host}/host/${guid}`));
    socket.onopen = () => {
      this.retry_delay = 10;
      socket.send(JSON.stringify({ guid })); // this isn't needed anymore, but meh
    };
    socket.onclose = ({ code, reason, wasClean }) => {
      // exponential backoff starting at 100 ms
      this.retry_delay = this.retry_delay * this.retry_delay;
      console.log(`WebSocket connection closed with ${code} ${reason}; clean: ${wasClean}; reconnecting in ${this.retry_delay} ms`);
      setTimeout(this.openSocket, this.retry_delay);
      trackException(`WebSocket connection closed with ${code} ${reason}`, wasClean);
    };
    socket.onerror = err => {
      console.log('WebSocket error', err);
      this.setState({
        ua: 'Error in WebSocket connection',
        time: new Date(),
        ip: null,
        revDns: null
      });
      trackException('WebSocket connection error');
    };
    socket.onmessage = msg => {
      console.log('WebSocket message', msg);
      const { ua, ip, revDns } = JSON.parse(msg.data);
      this.setState({
        ua,
        ip,
        revDns,
        time: new Date()
      });
      trackEvent('host', 'client visited', ua);
    };
  }

  componentDidMount() {
    this.openSocket();
  }

  componentWillUnmount() {
    if (this.socket) {
      this.socket.onclose = null; // don't automatically reconnect
      this.socket.close();
    }
  }

  get clientLink() {
    const guid = this.props.guid;
    const base = typeof location !== 'undefined' ? `${location.protocol}//${location.host}` : 'http://user-agent.io';
    return `${base}/share-with/${guid}`;
  }

  onLinkTextClick(e) {
    e.target.select();
    trackEvent('host', 'link selected');
  }

  render() {
    const source = 'Remote User Agent:';
    const { ua, time, ip, revDns } = this.state;
    const url = this.clientLink;
    return (
      <Layout title="Find out what browser someone else is using - 🖥 📱 💻 📟">
        <main>

          {ua
            ? <UA source={source} ua={ua} detail={<span>{revDns} {ip} (<TimeAgo date={time} />)</span>} />
            : <UA source={source} ua="Awaiting remote user..." detail="See below for your link to give out." link={false} />}

          <section className="container">

            <div className="form-group row">
              <label htmlFor="link" className="col-sm-4 col-form-label">Have someone click this link: </label>
              <div className="col-sm-8">
                <input className="form-control" value={url} readOnly onClick={this.onLinkTextClick} id="link" />
              </div>
            </div>

            <BannerAd />

            <h3>🖥 The best way to find out what browser someone else is using</h3>
            <p>Just have them click your link and you'll instantly see their browser details - it's better than standing over their shoulder!</p>

            <h3>🎩 Magic!</h3>

            <p>
              It's not actually magic - the way this works is that when you visit this page, a unique ID is generated.
              After this page loads, it makes <a href="https://tools.ietf.org/html/rfc6455">WebSocket</a> connection to
              the <Link href="/"><a>user-agent.io</a></Link> server.
              That connection stays open until you close the page, and the server marks it as associated with your unique ID.
            </p>
            <p>
              Then, when a user clicks on your link, the server matches the ID in the link to your WebSocket connection.
              It reads the visitor's User-Agent header and sends it to your browser over the WebSocket.
            </p>

          </section>
        </main>
      </Layout>
    );
  }
}

Host.getInitialProps = () => ({
  guid: uuidV4()
});

export default Host;
