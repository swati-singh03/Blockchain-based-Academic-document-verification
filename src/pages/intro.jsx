import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

function Intro() {

  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate("/");   // ✅ Home route
    }, 12000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <>
      <style>{`

        body{
          margin:0;
          overflow:hidden;
          font-family:'Montserrat',sans-serif;
        }

        video{
          position:fixed;
          width:100%;
          height:100%;
          object-fit:cover;
        }

        .overlay{
          position:fixed;
          inset:0;
          background:rgba(0,0,0,0.5);
        }

        h1{
          position:absolute;
          top:38%;
          left:50%;
          transform:translate(-50%,-50%);
          font-size:100px;
          color:white;
          text-shadow:0 0 35px #00ffff;
          opacity:0;
          animation:textIn 2s forwards;
          animation-delay:2s;
        }

        @keyframes textIn{to{opacity:1}}

        .img-box{
          width:340px;
          height:210px;
          overflow:hidden;
          border-radius:20px;
          box-shadow:0 0 30px rgba(0,255,255,0.8);
        }

        .img-box img{
          width:100%;
          height:100%;
          object-fit:cover;
        }

        .top{
          position:absolute;
          top:20px;
          opacity:0;
          animation:fadeIn 2s forwards;
          animation-delay:5s;
        }

        .top-left{left:20px;}
        .top-right{right:20px;}

        .gallery{
          position:absolute;
          bottom:20px;
          width:100%;
          display:flex;
          justify-content:center;
          gap:30px;
          opacity:0;
          animation:galleryIn 2s forwards;
          animation-delay:6s;
        }

        @keyframes fadeIn{to{opacity:1}}
        @keyframes galleryIn{to{opacity:1}}

      `}</style>

      <video autoPlay muted loop playsInline>
        <source src="/videos.mp4" type="video/mp4" />
      </video>

      <div className="overlay"></div>

      <h1>BlockVerify</h1>

      <div className="img-box top top-left">
        <img src="/image5.png" alt="" />
      </div>

      <div className="img-box top top-right">
        <img src="/image6.png" alt="" />
      </div>

      <div className="gallery">
        <div className="img-box"><img src="/image.png" alt="" /></div>
        <div className="img-box"><img src="/image3.png" alt="" /></div>
        <div className="img-box"><img src="/image1.png" alt="" /></div>
        <div className="img-box"><img src="/image2.png" alt="" /></div>
      </div>
    </>
  );
}

export default Intro;